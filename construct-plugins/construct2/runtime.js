(() => {
  var __async = (__this, __arguments, generator) => {
    return new Promise((resolve, reject) => {
      var fulfilled = (value) => {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      };
      var rejected = (value) => {
        try {
          step(generator.throw(value));
        } catch (e) {
          reject(e);
        }
      };
      var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
      step((generator = generator.apply(__this, __arguments)).next());
    });
  };

  // construct-plugins/shared/bridge-client.js
  var DEFAULT_SERVER_URL = "http://localhost:3000";
  var RECONNECT_DELAY_MS = 2e3;
  var MAX_RECONNECT_DELAY_MS = 3e4;
  function cleanServerUrl(url) {
    return String(url || DEFAULT_SERVER_URL).trim().replace(/\/+$/, "");
  }
  function makeErrorMessage(error) {
    return error && error.message ? error.message : String(error || "Unknown connection error");
  }
  var BridgeClient = class {
    constructor(callbacks) {
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
    setServerUrl(url) {
      const nextUrl = cleanServerUrl(url);
      if (!/^https?:\/\//i.test(nextUrl))
        throw new Error("Server URL must start with http:// or https://");
      this._serverUrl = nextUrl;
    }
    getServerUrl() {
      return this._serverUrl;
    }
    getStatus() {
      return this._lastStatus;
    }
    getViewerCount() {
      return this._viewerCount;
    }
    getUsername() {
      return this._username;
    }
    getErrorMessage() {
      return this._errorMessage;
    }
    getLastEvent() {
      return this._lastEvent || {};
    }
    authenticate(sessionId) {
      return __async(this, null, function* () {
        const value = String(sessionId || "").trim();
        if (!value) {
          const error = new Error("TikTok session ID or cookie is required");
          this._handleError(error);
          throw error;
        }
        try {
          return yield this._request("/api/connector/session", {
            method: "POST",
            body: JSON.stringify({ sessionId: value })
          });
        } catch (error) {
          this._handleError(error);
          throw error;
        }
      });
    }
    connect(username, sessionId) {
      return __async(this, null, function* () {
        const channel = String(username || "").trim().replace(/^@/, "");
        if (!channel) {
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
        try {
          const options = { username: channel };
          const credential = String(sessionId || "").trim();
          if (credential)
            options.sessionId = credential;
          const response = yield this._request("/api/connector/connect", {
            method: "POST",
            body: JSON.stringify(options)
          });
          if (response && response.status && response.status.status)
            this._handleStatus(response.status);
          return response;
        } catch (error) {
          this._handleError(error);
          throw error;
        }
      });
    }
    disconnect() {
      return __async(this, null, function* () {
        this._shouldReconnect = false;
        this._clearRetry();
        try {
          yield this._request("/api/connector/disconnect", { method: "POST" });
        } catch (error) {
          this._handleError(error);
          throw error;
        } finally {
          this._closeSocket();
          this._setStatus("disconnected", { username: this._username });
        }
      });
    }
    destroy() {
      this._shouldReconnect = false;
      this._clearRetry();
      this._closeSocket();
    }
    _request(path, options) {
      return __async(this, null, function* () {
        if (typeof fetch !== "function")
          throw new Error("This Construct runtime does not provide fetch()");
        const requestOptions = Object.assign({
          headers: { "Content-Type": "application/json" }
        }, options || {});
        const response = yield fetch(this._serverUrl + path, requestOptions);
        let data = {};
        try {
          data = yield response.json();
        } catch (error) {
          if (response.ok)
            throw new Error("The TikTok Overlay server returned invalid JSON");
        }
        if (!response.ok)
          throw new Error(data && data.error || "TikTok Overlay server returned HTTP " + response.status);
        return data;
      });
    }
    _openSocket() {
      if (!this._shouldReconnect || this._socket)
        return;
      if (typeof WebSocket !== "function") {
        this._handleError(new Error("This Construct runtime does not provide WebSocket"));
        return;
      }
      const wsUrl = this._serverUrl.replace(/^http/i, "ws") + "/ws";
      let socket;
      try {
        socket = new WebSocket(wsUrl);
      } catch (error) {
        this._handleError(error);
        this._scheduleReconnect();
        return;
      }
      this._socket = socket;
      socket.onopen = () => {
        this._retryDelay = RECONNECT_DELAY_MS;
      };
      socket.onmessage = (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch (error) {
          this._handleError(new Error("Received an invalid WebSocket message"));
          return;
        }
        if (!message || typeof message.type !== "string")
          return;
        if (message.type === "event") {
          this._lastEvent = message.payload || {};
          this._emit("onEvent", this._lastEvent);
        } else if (message.type === "connector_status") {
          this._handleStatus(message.payload || {});
        }
      };
      socket.onerror = () => {
        this._handleError(new Error("WebSocket connection to the TikTok Overlay server failed"));
      };
      socket.onclose = () => {
        if (this._socket === socket)
          this._socket = null;
        if (this._shouldReconnect) {
          this._setStatus("disconnected", { username: this._username });
          this._scheduleReconnect();
        }
      };
    }
    _handleStatus(payload) {
      const status = String(payload.status || "disconnected").toLowerCase();
      this._username = payload.username || this._username;
      this._errorMessage = payload.errorMessage || "";
      this._setStatus(status, payload);
      if (payload.viewerCount !== void 0 && Number.isFinite(Number(payload.viewerCount)) && Number(payload.viewerCount) !== this._viewerCount) {
        this._viewerCount = Number(payload.viewerCount);
        this._emit("onViewerCount", this._viewerCount);
      }
    }
    _handleError(error) {
      this._errorMessage = makeErrorMessage(error);
      this._setStatus("error", { username: this._username, errorMessage: this._errorMessage }, true);
      this._emit("onError", this._errorMessage);
    }
    _setStatus(status, payload, force) {
      if (status === this._lastStatus && !force)
        return;
      this._lastStatus = status;
      this._emit("onStatus", status, payload || {});
    }
    _scheduleReconnect() {
      if (!this._shouldReconnect || this._retryTimer)
        return;
      const delay = this._retryDelay;
      this._retryDelay = Math.min(this._retryDelay * 2, MAX_RECONNECT_DELAY_MS);
      this._retryTimer = setTimeout(() => {
        this._retryTimer = null;
        this._openSocket();
      }, delay);
    }
    _clearRetry() {
      if (this._retryTimer) {
        clearTimeout(this._retryTimer);
        this._retryTimer = null;
      }
    }
    _closeSocket() {
      if (!this._socket)
        return;
      const socket = this._socket;
      this._socket = null;
      socket.onclose = null;
      socket.close();
    }
    _emit(name) {
      const callback = this._callbacks[name];
      if (typeof callback === "function")
        callback.apply(null, Array.prototype.slice.call(arguments, 1));
    }
  };

  // construct-plugins/construct2/runtime.entry.js
  cr.plugins_.TikTokLiveListener = function(runtime) {
    this.runtime = runtime;
  };
  (function() {
    const pluginProto = cr.plugins_.TikTokLiveListener.prototype;
    pluginProto.Type = function(plugin) {
      this.plugin = plugin;
      this.runtime = plugin.runtime;
    };
    pluginProto.Type.prototype.onCreate = function() {
    };
    pluginProto.Instance = function(type) {
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
    pluginProto.Instance.prototype.onCreate = function() {
      const self = this;
      this.bridge = new BridgeClient({
        onEvent: function(event) {
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
        onStatus: function(status, payload) {
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
        onViewerCount: function() {
          self.runtime.trigger(pluginProto.cnds.OnViewerCountChanged, self);
        },
        onError: function(message) {
          self.errorMessage = String(message || "");
        }
      });
      this.bridge.setServerUrl(this.serverUrl);
    };
    pluginProto.Instance.prototype.onDestroy = function() {
      if (this.bridge)
        this.bridge.destroy();
    };
    pluginProto.Instance.prototype.saveToJSON = function() {
      return {
        serverUrl: this.serverUrl,
        channel: this.channel,
        status: this.status,
        lastEvent: this.lastEvent
      };
    };
    pluginProto.Instance.prototype.loadFromJSON = function(o) {
      this.serverUrl = o.serverUrl || DEFAULT_SERVER_URL;
      this.channel = o.channel || "";
      this.status = o.status || "disconnected";
      this.lastEvent = o.lastEvent || {};
      if (this.bridge)
        this.bridge.setServerUrl(this.serverUrl);
    };
    function Acts() {
    }
    Acts.prototype.Connect = function(channel, sessionId) {
      this.channel = String(channel || "").trim().replace(/^@/, "");
      this.sessionId = String(sessionId || "").trim();
      this.bridge.connect(this.channel, this.sessionId).catch(function() {
      });
    };
    Acts.prototype.AuthenticateSession = function(sessionId) {
      const self = this;
      this.sessionId = String(sessionId || "").trim();
      this.bridge.authenticate(this.sessionId).catch(function(error) {
        self.errorMessage = error.message || String(error);
      });
    };
    Acts.prototype.Disconnect = function() {
      const self = this;
      this.bridge.disconnect().catch(function(error) {
        self.errorMessage = error.message || String(error);
      });
    };
    Acts.prototype.SetServerURL = function(url) {
      this.serverUrl = String(url || DEFAULT_SERVER_URL).trim();
      this.bridge.setServerUrl(this.serverUrl);
    };
    pluginProto.acts = new Acts();
    function Cnds() {
    }
    Cnds.prototype.OnJoin = function() {
      return true;
    };
    Cnds.prototype.OnChat = function() {
      return true;
    };
    Cnds.prototype.OnLikeBurst = function() {
      return true;
    };
    Cnds.prototype.OnGift = function() {
      return true;
    };
    Cnds.prototype.OnShare = function() {
      return true;
    };
    Cnds.prototype.OnFollow = function() {
      return true;
    };
    Cnds.prototype.OnConnected = function() {
      return true;
    };
    Cnds.prototype.OnDisconnected = function() {
      return true;
    };
    Cnds.prototype.OnOffline = function() {
      return true;
    };
    Cnds.prototype.OnError = function() {
      return true;
    };
    Cnds.prototype.OnConnecting = function() {
      return true;
    };
    Cnds.prototype.OnViewerCountChanged = function() {
      return true;
    };
    pluginProto.cnds = new Cnds();
    function Exps() {
    }
    Exps.prototype.Channel = function(ret) {
      ret.set_string(this.channel);
    };
    Exps.prototype.Status = function(ret) {
      ret.set_string(this.status);
    };
    Exps.prototype.ErrorMessage = function(ret) {
      ret.set_string(this.errorMessage);
    };
    Exps.prototype.UserID = function(ret) {
      ret.set_string(this.lastEvent.userId || "");
    };
    Exps.prototype.Username = function(ret) {
      ret.set_string(this.lastEvent.username || "");
    };
    Exps.prototype.ProfilePictureURL = function(ret) {
      ret.set_string(this.lastEvent.pfpUrl || "");
    };
    Exps.prototype.Message = function(ret) {
      ret.set_string(this.lastEvent.message || "");
    };
    Exps.prototype.LikeCount = function(ret) {
      ret.set_float(Number(this.lastEvent.count) || 0);
    };
    Exps.prototype.TotalLikesThisStream = function(ret) {
      ret.set_float(Number(this.lastEvent.totalLikesThisStream) || 0);
    };
    Exps.prototype.GiftID = function(ret) {
      ret.set_string(this.lastEvent.giftId == null ? "" : String(this.lastEvent.giftId));
    };
    Exps.prototype.GiftName = function(ret) {
      ret.set_string(this.lastEvent.giftName || "");
    };
    Exps.prototype.DiamondCount = function(ret) {
      ret.set_float(Number(this.lastEvent.diamondCount) || 0);
    };
    Exps.prototype.GiftRepeatCount = function(ret) {
      ret.set_float(Number(this.lastEvent.repeatCount) || 0);
    };
    Exps.prototype.EventTimestamp = function(ret) {
      ret.set_float(Number(this.lastEvent.timestamp) || 0);
    };
    Exps.prototype.StreamID = function(ret) {
      ret.set_string(this.lastEvent.streamId || "");
    };
    Exps.prototype.LastEventJSON = function(ret) {
      ret.set_string(JSON.stringify(this.lastEvent));
    };
    Exps.prototype.EventField = function(ret, fieldName) {
      ret.set_string(this.lastEvent[fieldName] == null ? "" : String(this.lastEvent[fieldName]));
    };
    Exps.prototype.ViewerCount = function(ret) {
      ret.set_float(this.bridge.getViewerCount());
    };
    pluginProto.exps = new Exps();
  })();
})();
