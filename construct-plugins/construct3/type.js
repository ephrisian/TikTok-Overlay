const SDK = globalThis.SDK;
const PLUGIN_CLASS = SDK.Plugins.Ephrisian_TikTokLiveListener;

PLUGIN_CLASS.Type = class TikTokLiveListenerType extends SDK.ITypeBase
{
	constructor(sdkPlugin, iObjectType)
	{
		super(sdkPlugin, iObjectType);
	}
};
