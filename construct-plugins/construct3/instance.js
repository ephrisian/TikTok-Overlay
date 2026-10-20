const SDK = globalThis.SDK;
const PLUGIN_CLASS = SDK.Plugins.Ephrisian_TikTokLiveListener;

PLUGIN_CLASS.Instance = class TikTokLiveListenerInstance extends SDK.IInstanceBase
{
	constructor(sdkType, inst)
	{
		super(sdkType, inst);
	}
};
