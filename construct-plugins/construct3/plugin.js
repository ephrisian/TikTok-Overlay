const SDK = globalThis.SDK;
const PLUGIN_ID = "Ephrisian_TikTokLiveListener";

const PLUGIN_CLASS = SDK.Plugins[PLUGIN_ID] = class TikTokLiveListenerPlugin extends SDK.IPluginBase
{
	constructor()
	{
		super(PLUGIN_ID);
		SDK.Lang.PushContext("plugins." + PLUGIN_ID.toLowerCase());
		this._info.SetName(globalThis.lang(".name"));
		this._info.SetDescription(globalThis.lang(".description"));
		this._info.SetCategory("web");
		this._info.SetAuthor("TikTok Overlay");
		this._info.SetHelpUrl(globalThis.lang(".help-url"));
		this._info.SetIsSingleGlobal(true);
		this._info.SetRuntimeModuleMainScript("c3runtime/main.js");
		SDK.Lang.PopContext();
	}
};

PLUGIN_CLASS.Register(PLUGIN_ID, PLUGIN_CLASS);
