# TikTok Live Listener for Construct 2 and Construct 3

This add-on lets Construct event sheets listen to TikTok events through this repository's existing TikTok Overlay server. The Construct plugin does not create another TikTok connector, UI, game, or database: the server remains responsible for the TikTok connection and event normalization.

## Build the add-ons

From the repository root:

```powershell
npm.cmd install
npm.cmd run build:construct-plugins
npm.cmd run test:construct-plugins
```

`construct-plugins/shared/bridge-client.js` is the single source for HTTP/WebSocket communication. The build produces these files:

- `construct-plugins/construct2/runtime.js`: bundled Construct 2 runtime, generated from `runtime.entry.js` and the shared bridge client.
- `construct-plugins/construct3/shared/bridge-client.js`: copy of the shared bridge client used by the Construct 3 add-on.

The Construct 2 editor integration (`construct2/edittime.js`) and Construct 3 add-on files are maintained directly in their respective folders, so the build does not generate them. It also does not create a `.c3addon` archive; package that separately as shown below.

## Construct 2

1. Build the add-ons using the commands above.
2. Create a folder named `TikTokLiveListener` in Construct 2's `plugins` add-on folder (open the folder from Construct 2's add-on browser if needed).
3. Copy `construct-plugins/construct2/edittime.js` and the generated `construct-plugins/construct2/runtime.js` into that folder. These are the two plugin files needed for this add-on; `runtime.js` must be regenerated after changing the runtime entry point or shared bridge client.
4. Fully close Construct 2 (it caches plugin scripts), then restart it and add the **TikTok Live Listener** object to the project. It is a single-global object.

## Construct 3

The `construct-plugins/construct3` folder is an SDK v2 add-on. Build it, then package its contents as a `.c3addon` archive with `addon.json` at the archive root:

```powershell
npm.cmd run build:construct-plugins
Compress-Archive -Path .\construct-plugins\construct3\* -DestinationPath .\TikTokLiveListener.zip -Force
Move-Item .\TikTokLiveListener.zip .\TikTokLiveListener.c3addon -Force
```

Install the resulting add-on in Construct 3 and restart the editor if prompted. The add-on requires Construct 3 r450 or newer.

## Configure and connect

The default bridge server URL is `http://localhost:3000`. Start the TikTok Overlay server before running the Construct project. If the server is elsewhere, use **Set server URL** before connecting. Use the server's base URL, with no `/api` or `/ws` suffix.

Use **Connect** with the channel username (with or without `@`). An optional session ID or full TikTok cookie may be passed to Connect. Alternatively, call **Authenticate session** first; this saves the credential in the Overlay server's local settings, and later connections can omit the optional credential. The Construct plugin does not store session credentials in project data. Use the same local authentication method as the Overlay app, and do not share session cookies.

The Overlay server stores one active TikTok channel connection. Connecting from another client changes the channel seen by all listener instances connected to that server.

## Event-sheet triggers and expressions

The plugin exposes these normalized event triggers:

- **On join**
- **On chat**
- **On like burst**
- **On gift**
- **On share**
- **On follow**

It also exposes **On connected**, **On disconnected**, **On offline**, and **On error**. Use **Status** and **ErrorMessage** to inspect connection state.
**On connecting** and **On viewer count changed** are also available for connection progress and the server's `roomUser` viewer-count updates; `ViewerCount` returns the current count.

For a TikTok event, the expressions provide `UserID`, `Username`, `ProfilePictureURL`, `Message`, `LikeCount`, `TotalLikesThisStream`, `GiftID`, `GiftName`, `DiamondCount`, `GiftRepeatCount`, `EventTimestamp`, and `StreamID`. `LastEventJSON` returns the complete normalized payload, including event-specific fields such as `firstTime`, `returningFromBreak`, and `timeAwayMs`. `EventField("fieldName")` reads an individual field not otherwise mapped.

Call **Disconnect** to stop listening and automatic WebSocket reconnection. The action also disconnects the server's shared TikTok connection.

## Browser origin access

The server allows browser previews served from `localhost`, `127.0.0.1`, or `[::1]` on any port for its connector HTTP endpoints. For a Construct project served from another origin, add its exact origin to `CONSTRUCT_PLUGIN_ALLOWED_ORIGINS`, separated by commas, before starting the server. For example:

```powershell
$env:CONSTRUCT_PLUGIN_ALLOWED_ORIGINS = "https://game.example.com"
npm.cmd run dev
```

Run the server only on a trusted network; TikTok session credentials are stored by the local Overlay server, not by the plugin.
