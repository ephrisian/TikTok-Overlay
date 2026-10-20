const C3 = globalThis.C3;

C3.Plugins.Ephrisian_TikTokLiveListener.Acts =
{
	Connect(channel, sessionId)
	{
		this._channel = String(channel || "").trim().replace(/^@/, "");
		this._bridge.connect(this._channel, sessionId).catch(() => {});
	},

	AuthenticateSession(sessionId)
	{
		this._bridge.authenticate(sessionId).catch(error =>
		{
			this._errorMessage = error.message || String(error);
		});
	},

	Disconnect()
	{
		this._bridge.disconnect().catch(error =>
		{
			this._errorMessage = error.message || String(error);
		});
	},

	SetServerURL(url)
	{
		this._serverUrl = String(url || "").trim();
		this._bridge.setServerUrl(this._serverUrl);
	}
};
