import { BridgeClient, DEFAULT_SERVER_URL } from "../shared/bridge-client.js";

const C3 = globalThis.C3;
const PLUGIN_CLASS = C3.Plugins.Ephrisian_TikTokLiveListener;

PLUGIN_CLASS.Instance = class TikTokLiveListenerInstance extends globalThis.ISDKInstanceBase
{
	constructor()
	{
		super();
		this._lastEvent = {};
		this._status = "disconnected";
		this._errorMessage = "";
		this._channel = "";
		this._serverUrl = DEFAULT_SERVER_URL;

		this._bridge = new BridgeClient({
			onEvent: event => this._handleEvent(event),
			onStatus: (status, payload) => this._handleStatus(status, payload),
			onViewerCount: () => this._trigger(PLUGIN_CLASS.Cnds.OnViewerCountChanged),
			onError: message => { this._errorMessage = String(message || ""); }
		});
	}

	_release()
	{
		this._bridge.destroy();
		super._release();
	}

	_handleEvent(event)
	{
		this._lastEvent = event || {};
		const condition = {
			join: PLUGIN_CLASS.Cnds.OnJoin,
			chat: PLUGIN_CLASS.Cnds.OnChat,
			like_burst: PLUGIN_CLASS.Cnds.OnLikeBurst,
			gift: PLUGIN_CLASS.Cnds.OnGift,
			share: PLUGIN_CLASS.Cnds.OnShare,
			follow: PLUGIN_CLASS.Cnds.OnFollow
		}[this._lastEvent.type];
		if (condition)
			this._trigger(condition);
	}

	_handleStatus(status, payload)
	{
		this._status = status;
		this._errorMessage = payload.errorMessage || this._errorMessage;
		const condition = {
			connecting: PLUGIN_CLASS.Cnds.OnConnecting,
			connected: PLUGIN_CLASS.Cnds.OnConnected,
			disconnected: PLUGIN_CLASS.Cnds.OnDisconnected,
			offline: PLUGIN_CLASS.Cnds.OnOffline,
			error: PLUGIN_CLASS.Cnds.OnError
		}[status];
		if (condition)
			this._trigger(condition);
	}

	_saveToJson()
	{
		return {
			serverUrl: this._serverUrl,
			channel: this._channel,
			status: this._status,
			lastEvent: this._lastEvent
		};
	}

	_loadFromJson(data)
	{
		this._serverUrl = data.serverUrl || DEFAULT_SERVER_URL;
		this._channel = data.channel || "";
		this._status = data.status || "disconnected";
		this._lastEvent = data.lastEvent || {};
		this._bridge.setServerUrl(this._serverUrl);
	}
};
