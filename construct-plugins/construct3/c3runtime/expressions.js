const C3 = globalThis.C3;

C3.Plugins.Ephrisian_TikTokLiveListener.Exps =
{
	Channel() { return this._channel; },
	Status() { return this._status; },
	ErrorMessage() { return this._errorMessage; },
	UserID() { return this._lastEvent.userId || ""; },
	Username() { return this._lastEvent.username || ""; },
	ProfilePictureURL() { return this._lastEvent.pfpUrl || ""; },
	Message() { return this._lastEvent.message || ""; },
	LikeCount() { return Number(this._lastEvent.count) || 0; },
	TotalLikesThisStream() { return Number(this._lastEvent.totalLikesThisStream) || 0; },
	GiftID() { return this._lastEvent.giftId == null ? "" : String(this._lastEvent.giftId); },
	GiftName() { return this._lastEvent.giftName || ""; },
	DiamondCount() { return Number(this._lastEvent.diamondCount) || 0; },
	GiftRepeatCount() { return Number(this._lastEvent.repeatCount) || 0; },
	EventTimestamp() { return Number(this._lastEvent.timestamp) || 0; },
	ViewerCount() { return this._bridge.getViewerCount(); },
	StreamID() { return this._lastEvent.streamId || ""; },
	LastEventJSON() { return JSON.stringify(this._lastEvent); },
	EventField(fieldName) { return this._lastEvent[fieldName] == null ? "" : String(this._lastEvent[fieldName]); }
};
