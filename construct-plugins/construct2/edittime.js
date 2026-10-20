function CreateObjectType()
{
	return {};
}

function CreateIDEObjectType()
{
	return new IDEObjectType();
}

function IDEObjectType()
{
	this.name = "TikTok Live Listener";
}

IDEObjectType.prototype.CreateInstance = function(instance)
{
	return new IDEInstance(instance, this);
};

function IDEInstance(instance, type)
{
	this.instance = instance;
	this.type = type;
	this.properties = {};
}

IDEInstance.prototype.OnCreate = function() {};
IDEInstance.prototype.OnInserted = function() {};
IDEInstance.prototype.OnDoubleClicked = function() {};
IDEInstance.prototype.OnPropertyChanged = function() {};
IDEInstance.prototype.OnRendererInit = function() {};
IDEInstance.prototype.Draw = function() {};
IDEInstance.prototype.OnRendererReleased = function() {};

function GetPluginSettings()
{
	return {
		name: "TikTok Live Listener",
		id: "TikTokLiveListener",
		version: "1.0",
		description: "Connects to the TikTok Overlay server and exposes TikTok live events.",
		author: "TikTok Overlay",
		"help url": "https://github.com/ephrisian/TikTok-Overlay",
		category: "general",
		type: "object",
		rotatable: false,
		flags: pf_singleglobal
	};
}

AddStringParam("Channel", "TikTok channel username. The leading @ is optional.", "\"\"");
AddStringParam("Session ID or cookie", "Optional TikTok session ID or cookie string.", "\"\"");
AddAction(0, af_none, "Connect", "Connection", "Connect to channel <i>{0}</i>", "Connect to a TikTok live channel.", "Connect");

AddStringParam("Session ID or cookie", "TikTok session ID or full cookie string.", "\"\"");
AddAction(1, af_none, "Authenticate session", "Authentication", "Authenticate with session <i>{0}</i>", "Save a TikTok session ID or cookie on the local overlay server.", "AuthenticateSession");

AddAction(2, af_none, "Disconnect", "Connection", "Disconnect from TikTok", "Disconnect the listener and stop reconnecting.", "Disconnect");

AddStringParam("Server URL", "Base URL of the TikTok Overlay server.", "\"http://localhost:3000\"");
AddAction(3, af_none, "Set server URL", "Connection", "Set server URL to <i>{0}</i>", "Choose the TikTok Overlay server to connect to.", "SetServerURL");

AddCondition(0, cf_trigger, "On join", "TikTok events", "On join event", "Triggered when a viewer joins.", "OnJoin");
AddCondition(1, cf_trigger, "On chat", "TikTok events", "On chat event", "Triggered when a viewer sends a chat message.", "OnChat");
AddCondition(2, cf_trigger, "On like burst", "TikTok events", "On like burst", "Triggered when a viewer sends likes.", "OnLikeBurst");
AddCondition(3, cf_trigger, "On gift", "TikTok events", "On gift", "Triggered when a viewer sends a gift.", "OnGift");
AddCondition(4, cf_trigger, "On share", "TikTok events", "On share", "Triggered when a viewer shares the stream.", "OnShare");
AddCondition(5, cf_trigger, "On follow", "TikTok events", "On follow", "Triggered when a viewer follows the channel.", "OnFollow");
AddCondition(6, cf_trigger, "On connected", "Connection", "On connected", "Triggered when the listener connects to a live channel.", "OnConnected");
AddCondition(7, cf_trigger, "On disconnected", "Connection", "On disconnected", "Triggered when the listener disconnects.", "OnDisconnected");
AddCondition(8, cf_trigger, "On offline", "Connection", "On offline", "Triggered when the channel is not live or its stream ends.", "OnOffline");
AddCondition(9, cf_trigger, "On error", "Connection", "On error", "Triggered when the listener encounters an error.", "OnError");
AddCondition(10, cf_trigger, "On connecting", "Connection", "On connecting", "Triggered when the listener begins connecting.", "OnConnecting");
AddCondition(11, cf_trigger, "On viewer count changed", "TikTok events", "On viewer count changed", "Triggered when the live viewer count changes.", "OnViewerCountChanged");

AddExpression(0, ef_return_string, "Channel", "Connection", "Channel", "The connected TikTok channel username.");
AddExpression(1, ef_return_string, "Status", "Connection", "Status", "The current connection status.");
AddExpression(2, ef_return_string, "Error message", "Connection", "ErrorMessage", "The latest connection error message.");
AddExpression(3, ef_return_string, "User ID", "TikTok event", "UserID", "The user ID from the latest event.");
AddExpression(4, ef_return_string, "Username", "TikTok event", "Username", "The username from the latest event.");
AddExpression(5, ef_return_string, "Profile picture URL", "TikTok event", "ProfilePictureURL", "The profile picture URL from the latest event.");
AddExpression(6, ef_return_string, "Message", "TikTok event", "Message", "The chat message from the latest chat event.");
AddExpression(7, ef_return_number, "Like count", "TikTok event", "LikeCount", "The count from the latest like burst.");
AddExpression(8, ef_return_number, "Total likes this stream", "TikTok event", "TotalLikesThisStream", "The stream like total from the latest like burst.");
AddExpression(9, ef_return_string, "Gift ID", "TikTok event", "GiftID", "The gift ID from the latest gift event.");
AddExpression(10, ef_return_string, "Gift name", "TikTok event", "GiftName", "The gift name from the latest gift event.");
AddExpression(11, ef_return_number, "Diamond count", "TikTok event", "DiamondCount", "The gift diamond value.");
AddExpression(12, ef_return_number, "Gift repeat count", "TikTok event", "GiftRepeatCount", "The gift repeat count.");
AddExpression(13, ef_return_number, "Event timestamp", "TikTok event", "EventTimestamp", "The event timestamp in milliseconds.");
AddExpression(14, ef_return_string, "Stream ID", "TikTok event", "StreamID", "The stream ID from the latest event.");
AddExpression(15, ef_return_string, "Last event JSON", "TikTok event", "LastEventJSON", "The complete latest normalized event as JSON.");
AddStringParam("Field name", "Name of a field in the latest normalized event.", "\"\"");
AddExpression(16, ef_return_string, "Event field", "TikTok event", "EventField", "Read a field from the latest event by name.");
AddExpression(17, ef_return_number, "Viewer count", "TikTok event", "ViewerCount", "The latest live viewer count reported by TikTok.");

ACESDone();

var property_list = [];

function CreateIDEObjectType()
{
	return new IDEObjectType();
}

function IDEObjectType()
{
	this.name = "TikTok Live Listener";
}

IDEObjectType.prototype.CreateInstance = function(instance)
{
	return new IDEInstance(instance, this);
};

function IDEInstance(instance, type)
{
	this.instance = instance;
	this.type = type;
	this.properties = {};

	for (var i = 0; i < property_list.length; i++)
		this.properties[property_list[i].name] = property_list[i].initial_value;
}

IDEInstance.prototype.OnCreate = function() {};
IDEInstance.prototype.OnInserted = function() {};
IDEInstance.prototype.OnDoubleClicked = function() {};
IDEInstance.prototype.OnPropertyChanged = function(property_name) {};
IDEInstance.prototype.OnRendererInit = function(renderer) {};
IDEInstance.prototype.Draw = function(renderer) {};
IDEInstance.prototype.OnRendererReleased = function(renderer) {};
