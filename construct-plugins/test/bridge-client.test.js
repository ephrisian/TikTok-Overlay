import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { BridgeClient, DEFAULT_SERVER_URL } from "../shared/bridge-client.js";

const originalFetch = globalThis.fetch;
const originalWebSocket = globalThis.WebSocket;

class MockWebSocket
{
	static instances = [];

	constructor(url)
	{
		this.url = url;
		this.readyState = 0;
		this.closeCount = 0;
		MockWebSocket.instances.push(this);
	}

	close()
	{
		this.closeCount += 1;
	}

	sendMessage(message)
	{
		this.onmessage({ data: JSON.stringify(message) });
	}
}

afterEach(() =>
{
	globalThis.fetch = originalFetch;
	globalThis.WebSocket = originalWebSocket;
	MockWebSocket.instances = [];
});

test("Construct 2 and Construct 3 adapters declare their runtime files and ACE implementations", async () =>
{
	const pluginRoot = fileURLToPath(new URL("..", import.meta.url));
	const c3Root = path.join(pluginRoot, "construct3");
	const addon = JSON.parse(await readFile(path.join(c3Root, "addon.json"), "utf8"));
	const aces = JSON.parse(await readFile(path.join(c3Root, "aces.json"), "utf8"));
	const c3Actions = await readFile(path.join(c3Root, "c3runtime/actions.js"), "utf8");
	const c3Conditions = await readFile(path.join(c3Root, "c3runtime/conditions.js"), "utf8");
	const c3Expressions = await readFile(path.join(c3Root, "c3runtime/expressions.js"), "utf8");
	const c2Editor = await readFile(path.join(pluginRoot, "construct2/edittime.js"), "utf8");
	const c2Runtime = await readFile(path.join(pluginRoot, "construct2/runtime.entry.js"), "utf8");
	const sharedClient = await readFile(path.join(pluginRoot, "shared/bridge-client.js"), "utf8");
	const c3Client = await readFile(path.join(c3Root, "shared/bridge-client.js"), "utf8");

	assert.equal(addon["sdk-version"], 2);
	assert.deepEqual(sharedClient, c3Client);
	assert.match(c2Editor, /function\s+CreateObjectType\s*\(\s*\)/);
	assert.match(c2Editor, /function\s+CreateIDEObjectType\s*\(\s*\)/);
	for (const file of addon["file-list"])
		await readFile(path.join(c3Root, file));

	for (const action of aces.custom.actions)
		assert.match(c3Actions, new RegExp("\\b" + action.scriptName + "\\s*\\("));
	for (const condition of aces.custom.conditions)
		assert.match(c3Conditions, new RegExp("\\b" + condition.scriptName + "\\s*\\("));
	for (const expression of aces.custom.expressions)
		assert.match(c3Expressions, new RegExp("\\b" + expression.expressionName + "\\s*\\("));

	for (const entry of [
		...aces.custom.actions,
		...aces.custom.conditions,
		...aces.custom.expressions
	])
	{
		assert.ok(c2Editor.includes(entry.scriptName || entry.expressionName));
		assert.ok(c2Runtime.includes(entry.scriptName || entry.expressionName));
	}
});

test("uses the local overlay server by default and normalizes server URLs", () =>
{
	const client = new BridgeClient();
	assert.equal(client.getServerUrl(), DEFAULT_SERVER_URL);
	client.setServerUrl("https://overlay.example.test///");
	assert.equal(client.getServerUrl(), "https://overlay.example.test");
	assert.throws(() => client.setServerUrl("overlay.example.test"), /http:\/\/ or https:\/\//);
});

test("authenticates, connects, and forwards normalized events and connector status", async () =>
{
	const requests = [];
	globalThis.fetch = async (url, options) =>
	{
		requests.push({ url, options });
		return {
			ok: true,
			status: 200,
			json: async () => url.endsWith("/connect")
				? { success: true, status: { status: "connecting", username: "streamer" } }
				: { success: true }
		};
	};
	globalThis.WebSocket = MockWebSocket;

	const receivedEvents = [];
	const receivedStatuses = [];
	const receivedViewerCounts = [];
	const receivedErrors = [];
	const client = new BridgeClient({
		onEvent: event => receivedEvents.push(event),
		onStatus: status => receivedStatuses.push(status),
		onViewerCount: count => receivedViewerCounts.push(count),
		onError: error => receivedErrors.push(error)
	});
	await client.authenticate("session-cookie");
	await client.connect("@streamer", "session-cookie");

	assert.equal(requests[0].url, DEFAULT_SERVER_URL + "/api/connector/session");
	assert.deepEqual(JSON.parse(requests[0].options.body), { sessionId: "session-cookie" });
	assert.equal(requests[1].url, DEFAULT_SERVER_URL + "/api/connector/connect");
	assert.deepEqual(JSON.parse(requests[1].options.body), {
		username: "streamer",
		sessionId: "session-cookie"
	});
	assert.equal(MockWebSocket.instances[0].url, "ws://localhost:3000/ws");

	const joinEvent = {
		type: "join",
		userId: "viewer-1",
		username: "viewer",
		firstTime: true
	};
	MockWebSocket.instances[0].sendMessage({ type: "event", payload: joinEvent });
	MockWebSocket.instances[0].sendMessage({
		type: "connector_status",
		payload: { status: "connected", username: "streamer", viewerCount: 42 }
	});
	MockWebSocket.instances[0].sendMessage({
		type: "connector_status",
		payload: { status: "connected", username: "streamer", viewerCount: 42 }
	});

	assert.deepEqual(receivedEvents, [joinEvent]);
	assert.deepEqual(client.getLastEvent(), joinEvent);
	assert.equal(client.getStatus(), "connected");
	assert.equal(client.getViewerCount(), 42);
	assert.deepEqual(receivedViewerCounts, [42]);
	assert.deepEqual(receivedStatuses, ["connecting", "connected"]);
	assert.deepEqual(receivedErrors, []);

	await client.disconnect();
	assert.equal(requests[2].url, DEFAULT_SERVER_URL + "/api/connector/disconnect");
	assert.equal(MockWebSocket.instances[0].closeCount, 1);
	assert.equal(client.getStatus(), "disconnected");
});

test("surfaces server errors through status, error callbacks, and rejected action promises", async () =>
{
	globalThis.fetch = async () => ({
		ok: false,
		status: 400,
		json: async () => ({ error: "Username is required" })
	});
	const statuses = [];
	const errors = [];
	const client = new BridgeClient({
		onStatus: status => statuses.push(status),
		onError: message => errors.push(message)
	});

	await assert.rejects(client.connect("", ""), /TikTok channel username is required/);
	assert.deepEqual(statuses, ["error"]);

	globalThis.fetch = async () => ({
		ok: false,
		status: 400,
		json: async () => ({ error: "Session rejected" })
	});
	await assert.rejects(client.authenticate("invalid"), /Session rejected/);
	assert.equal(client.getStatus(), "error");
	assert.deepEqual(statuses, ["error", "error"]);
	assert.deepEqual(errors, ["TikTok channel username is required", "Session rejected"]);
});
