import { BridgeClient, DEFAULT_SERVER_URL } from "../shared/bridge-client.js";

cr.plugins_.TikTokLiveListener = function(runtime)
{
	this.runtime = runtime;
};

(function ()
{
	const pluginProto = cr.plugins_.TikTokLiveListener.prototype;

	pluginProto.Type = function(plugin)
	{
		this.plugin = plugin;
		this.runtime = plugin.runtime;
	};
	pluginProto.Type.prototype.onCreate = function() {};

	pluginProto.Instance = function(type)
	{
		this.type = type;
		this.runtime = type.runtime;
		this.bridge = null;
		this.lastEvent = {};
		this.status = "disconnected";
		this.errorMessage = "";
		this.channel = "";
		this.sessionId = "";
		this.serverUrl = DEFAULT_SERVER_URL;
	};

	pluginProto.Instance.prototype.onCreate = function()
	{
		const self = this;
		this.bridge = new BridgeClient({
			onEvent: function(event)
			{
				self.lastEvent = event || {};
				const condition = {
					join: pluginProto.cnds.OnJoin,
					chat: pluginProto.cnds.OnChat,
					like_burst: pluginProto.cnds.OnLikeBurst,
					gift: pluginProto.cnds.OnGift,
					share: pluginProto.cnds.OnShare,
					follow: pluginProto.cnds.OnFollow
				}[self.lastEvent.type];
				if (condition)
					self.runtime.trigger(condition, self);
			},
			onStatus: function(status, payload)
			{
				self.status = status;
				self.errorMessage = payload.errorMessage || self.errorMessage;
				const condition = {
					connecting: pluginProto.cnds.OnConnecting,
					connected: pluginProto.cnds.OnConnected,
					disconnected: pluginProto.cnds.OnDisconnected,
					offline: pluginProto.cnds.OnOffline,
					error: pluginProto.cnds.OnError
				}[status];
				if (condition)
					self.runtime.trigger(condition, self);
			},
			onViewerCount: function()
			{
				self.runtime.trigger(pluginProto.cnds.OnViewerCountChanged, self);
			},
			onError: function(message)
			{
				self.errorMessage = String(message || "");
			}
		});
		this.bridge.setServerUrl(this.serverUrl);
	};

	pluginProto.Instance.prototype.onDestroy = function()
	{
		if (this.bridge)
			this.bridge.destroy();
	};

	pluginProto.Instance.prototype.saveToJSON = function()
	{
		return {
			serverUrl: this.serverUrl,
			channel: this.channel,
			status: this.status,
			lastEvent: this.lastEvent
		};
	};

	pluginProto.Instance.prototype.loadFromJSON = function(o)
	{
		this.serverUrl = o.serverUrl || DEFAULT_SERVER_URL;
		this.channel = o.channel || "";
		this.status = o.status || "disconnected";
		this.lastEvent = o.lastEvent || {};
		if (this.bridge)
			this.bridge.setServerUrl(this.serverUrl);
	};

	function Acts() {}
	Acts.prototype.Connect = function(channel, sessionId)
	{
		this.channel = String(channel || "").trim().replace(/^@/, "");
		this.sessionId = String(sessionId || "").trim();
		this.bridge.connect(this.channel, this.sessionId).catch(function() {});
	};
	Acts.prototype.AuthenticateSession = function(sessionId)
	{
		const self = this;
		this.sessionId = String(sessionId || "").trim();
		this.bridge.authenticate(this.sessionId).catch(function(error)
		{
			self.errorMessage = error.message || String(error);
		});
	};
	Acts.prototype.Disconnect = function()
	{
		const self = this;
		this.bridge.disconnect().catch(function(error)
		{
			self.errorMessage = error.message || String(error);
		});
	};
	Acts.prototype.SetServerURL = function(url)
	{
		this.serverUrl = String(url || DEFAULT_SERVER_URL).trim();
		this.bridge.setServerUrl(this.serverUrl);
	};
	pluginProto.acts = new Acts();

	function Cnds() {}
	Cnds.prototype.OnJoin = function() { return true; };
	Cnds.prototype.OnChat = function() { return true; };
	Cnds.prototype.OnLikeBurst = function() { return true; };
	Cnds.prototype.OnGift = function() { return true; };
	Cnds.prototype.OnShare = function() { return true; };
	Cnds.prototype.OnFollow = function() { return true; };
	Cnds.prototype.OnConnected = function() { return true; };
	Cnds.prototype.OnDisconnected = function() { return true; };
	Cnds.prototype.OnOffline = function() { return true; };
	Cnds.prototype.OnError = function() { return true; };
	Cnds.prototype.OnConnecting = function() { return true; };
	Cnds.prototype.OnViewerCountChanged = function() { return true; };
	pluginProto.cnds = new Cnds();

	function Exps() {}
	Exps.prototype.Channel = function(ret) { ret.set_string(this.channel); };
	Exps.prototype.Status = function(ret) { ret.set_string(this.status); };
	Exps.prototype.ErrorMessage = function(ret) { ret.set_string(this.errorMessage); };
	Exps.prototype.UserID = function(ret) { ret.set_string(this.lastEvent.userId || ""); };
	Exps.prototype.Username = function(ret) { ret.set_string(this.lastEvent.username || ""); };
	Exps.prototype.ProfilePictureURL = function(ret) { ret.set_string(this.lastEvent.pfpUrl || ""); };
	Exps.prototype.Message = function(ret) { ret.set_string(this.lastEvent.message || ""); };
	Exps.prototype.LikeCount = function(ret) { ret.set_float(Number(this.lastEvent.count) || 0); };
	Exps.prototype.TotalLikesThisStream = function(ret) { ret.set_float(Number(this.lastEvent.totalLikesThisStream) || 0); };
	Exps.prototype.GiftID = function(ret) { ret.set_string(this.lastEvent.giftId == null ? "" : String(this.lastEvent.giftId)); };
	Exps.prototype.GiftName = function(ret) { ret.set_string(this.lastEvent.giftName || ""); };
	Exps.prototype.DiamondCount = function(ret) { ret.set_float(Number(this.lastEvent.diamondCount) || 0); };
	Exps.prototype.GiftRepeatCount = function(ret) { ret.set_float(Number(this.lastEvent.repeatCount) || 0); };
	Exps.prototype.EventTimestamp = function(ret) { ret.set_float(Number(this.lastEvent.timestamp) || 0); };
	Exps.prototype.StreamID = function(ret) { ret.set_string(this.lastEvent.streamId || ""); };
	Exps.prototype.LastEventJSON = function(ret) { ret.set_string(JSON.stringify(this.lastEvent)); };
	Exps.prototype.EventField = function(ret, fieldName) { ret.set_string(this.lastEvent[fieldName] == null ? "" : String(this.lastEvent[fieldName])); };
	Exps.prototype.ViewerCount = function(ret) { ret.set_float(this.bridge.getViewerCount()); };
	pluginProto.exps = new Exps();
}());
