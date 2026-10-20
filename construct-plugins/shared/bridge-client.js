const DEFAULT_SERVER_URL = "http://localhost:3000";
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30000;

function cleanServerUrl(url)
{
	return String(url || DEFAULT_SERVER_URL).trim().replace(/\/+$/, "");
}

function makeErrorMessage(error)
{
	return error && error.message ? error.message : String(error || "Unknown connection error");
}

export class BridgeClient
{
	constructor(callbacks)
	{
		this._callbacks = callbacks || {};
		this._serverUrl = DEFAULT_SERVER_URL;
		this._socket = null;
		this._retryTimer = null;
		this._retryDelay = RECONNECT_DELAY_MS;
		this._shouldReconnect = false;
		this._lastStatus = "disconnected";
		this._viewerCount = 0;
		this._username = "";
		this._errorMessage = "";
		this._lastEvent = null;
	}

	setServerUrl(url)
	{
		const nextUrl = cleanServerUrl(url);
		if (!/^https?:\/\//i.test(nextUrl))
			throw new Error("Server URL must start with http:// or https://");

		this._serverUrl = nextUrl;
	}

	getServerUrl()
	{
		return this._serverUrl;
	}

	getStatus()
	{
		return this._lastStatus;
	}

	getViewerCount()
	{
		return this._viewerCount;
	}

	getUsername()
	{
		return this._username;
	}

	getErrorMessage()
	{
		return this._errorMessage;
	}

	getLastEvent()
	{
		return this._lastEvent || {};
	}

	async authenticate(sessionId)
	{
		const value = String(sessionId || "").trim();
		if (!value)
		{
			const error = new Error("TikTok session ID or cookie is required");
			this._handleError(error);
			throw error;
		}

		try
		{
			return await this._request("/api/connector/session", {
				method: "POST",
				body: JSON.stringify({ sessionId: value })
			});
		}
		catch (error)
		{
			this._handleError(error);
			throw error;
		}
	}

	async connect(username, sessionId)
	{
		const channel = String(username || "").trim().replace(/^@/, "");
		if (!channel)
		{
			const error = new Error("TikTok channel username is required");
			this._handleError(error);
			throw error;
		}

		this._username = channel;
		this._errorMessage = "";
		this._shouldReconnect = true;
		this._clearRetry();
		this._setStatus("connecting", { username: channel });
		this._openSocket();

		try
		{
			const options = { username: channel };
			const credential = String(sessionId || "").trim();
			if (credential)
				options.sessionId = credential;

			const response = await this._request("/api/connector/connect", {
				method: "POST",
				body: JSON.stringify(options)
			});
			if (response && response.status && response.status.status)
				this._handleStatus(response.status);
			return response;
		}
		catch (error)
		{
			this._handleError(error);
			throw error;
		}
	}

	async disconnect()
	{
		this._shouldReconnect = false;
		this._clearRetry();

		try
		{
			await this._request("/api/connector/disconnect", { method: "POST" });
		}
		catch (error)
		{
			this._handleError(error);
			throw error;
		}
		finally
		{
			this._closeSocket();
			this._setStatus("disconnected", { username: this._username });
		}
	}

	destroy()
	{
		this._shouldReconnect = false;
		this._clearRetry();
		this._closeSocket();
	}

	async _request(path, options)
	{
		if (typeof fetch !== "function")
			throw new Error("This Construct runtime does not provide fetch()");

		const requestOptions = Object.assign({
			headers: { "Content-Type": "application/json" }
		}, options || {});
		const response = await fetch(this._serverUrl + path, requestOptions);
		let data = {};
		try
		{
			data = await response.json();
		}
		catch (error)
		{
			if (response.ok)
				throw new Error("The TikTok Overlay server returned invalid JSON");
		}

		if (!response.ok)
			throw new Error((data && data.error) || ("TikTok Overlay server returned HTTP " + response.status));
		return data;
	}

	_openSocket()
	{
		if (!this._shouldReconnect || this._socket)
			return;
		if (typeof WebSocket !== "function")
		{
			this._handleError(new Error("This Construct runtime does not provide WebSocket"));
			return;
		}

		const wsUrl = this._serverUrl.replace(/^http/i, "ws") + "/ws";
		let socket;
		try
		{
			socket = new WebSocket(wsUrl);
		}
		catch (error)
		{
			this._handleError(error);
			this._scheduleReconnect();
			return;
		}

		this._socket = socket;
		socket.onopen = () =>
		{
			this._retryDelay = RECONNECT_DELAY_MS;
		};
		socket.onmessage = event =>
		{
			let message;
			try
			{
				message = JSON.parse(event.data);
			}
			catch (error)
			{
				this._handleError(new Error("Received an invalid WebSocket message"));
				return;
			}

			if (!message || typeof message.type !== "string")
				return;
			if (message.type === "event")
			{
				this._lastEvent = message.payload || {};
				this._emit("onEvent", this._lastEvent);
			}
			else if (message.type === "connector_status")
			{
				this._handleStatus(message.payload || {});
			}
		};
		socket.onerror = () =>
		{
			this._handleError(new Error("WebSocket connection to the TikTok Overlay server failed"));
		};
		socket.onclose = () =>
		{
			if (this._socket === socket)
				this._socket = null;
			if (this._shouldReconnect)
			{
				this._setStatus("disconnected", { username: this._username });
				this._scheduleReconnect();
			}
		};
	}

	_handleStatus(payload)
	{
		const status = String(payload.status || "disconnected").toLowerCase();
		this._username = payload.username || this._username;
		this._errorMessage = payload.errorMessage || "";
		this._setStatus(status, payload);
		if (payload.viewerCount !== undefined &&
			Number.isFinite(Number(payload.viewerCount)) &&
			Number(payload.viewerCount) !== this._viewerCount)
		{
			this._viewerCount = Number(payload.viewerCount);
			this._emit("onViewerCount", this._viewerCount);
		}
	}

	_handleError(error)
	{
		this._errorMessage = makeErrorMessage(error);
		this._setStatus("error", { username: this._username, errorMessage: this._errorMessage }, true);
		this._emit("onError", this._errorMessage);
	}

	_setStatus(status, payload, force)
	{
		if (status === this._lastStatus && !force)
			return;
		this._lastStatus = status;
		this._emit("onStatus", status, payload || {});
	}

	_scheduleReconnect()
	{
		if (!this._shouldReconnect || this._retryTimer)
			return;
		const delay = this._retryDelay;
		this._retryDelay = Math.min(this._retryDelay * 2, MAX_RECONNECT_DELAY_MS);
		this._retryTimer = setTimeout(() =>
		{
			this._retryTimer = null;
			this._openSocket();
		}, delay);
	}

	_clearRetry()
	{
		if (this._retryTimer)
		{
			clearTimeout(this._retryTimer);
			this._retryTimer = null;
		}
	}

	_closeSocket()
	{
		if (!this._socket)
			return;
		const socket = this._socket;
		this._socket = null;
		socket.onclose = null;
		socket.close();
	}

	_emit(name)
	{
		const callback = this._callbacks[name];
		if (typeof callback === "function")
			callback.apply(null, Array.prototype.slice.call(arguments, 1));
	}
}

export { DEFAULT_SERVER_URL };
