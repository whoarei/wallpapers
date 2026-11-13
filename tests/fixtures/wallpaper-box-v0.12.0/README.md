These test-only files are unmodified host scripts from whoarei/wallpaper-box
v0.12.0 (`wallpaper-host/src-tauri/wallpaper-settings.js` and
`wallpaper-host/src-tauri/wallpaper-mode.js`). They exercise the
public settings protocol with the actual host SDK and playback wrapper.
Production packages request the SDK from `/__wallpaper_host__/settings.js`.
