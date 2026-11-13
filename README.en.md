# Wallpaper Box · Official Wallpaper Library

[简体中文](README.md) | **English**

This is the official collection of live wallpapers for [Wallpaper Box](https://github.com/whoarei/wallpaper-box), featuring pixel towns, natural landscapes, underwater worlds, and a real-time night sky. Browse, download individual wallpapers, and switch between them in the app. Installed wallpapers work offline.

You can also download wallpaper packages from [GitHub Releases](https://github.com/whoarei/wallpapers/releases) or [Gitee Releases](https://gitee.com/xishuaiya/wallpapers/releases).

## Wallpaper list

| Wallpaper | Description |
| --- | --- |
| Pinewind Town | A pixel-art town nestled in the woods, with a little train passing through and a day and night cycle. Click to plant flowers. |
| Stillwater Aquarium | An aquarium surrounded by plants and soft light, with swimming fish, colorful crabs waving their claws, click-to-feed interactions, and occasional shark visits. |
| A Window to Elsewhere | A window overlooking distant mountains, a lake, and slowly drifting clouds, with sunny and rainy weather to choose from. |
| Pixel Camp | A tent, campfire, stream, and fireflies in a pine forest beneath a slowly changing sky. |
| Sky Islands | Floating islands and waterfalls above a sea of clouds, with a drifting airship, turning windmills, and plants swaying in the breeze. |
| Orbital Observatory | A blue planet, star trails, and meteors beyond the viewport, paired with a local clock for a peaceful space atmosphere. |
| The Night Train | A warmly lit carriage, raindrops on the glass, and city lights passing outside, evoking a journey on a night train. |
| Ocean Drift | A panoramic underwater world that changes with the weather and time of day, spanning coral gardens, kelp forests, and the deep sea. Tap for glowing ripples or touch animals to make them swim away. |
| The Sky Above You | A night sky based on your chosen location and the current time, featuring 5,044 stars, constellations, and the direction of the Milky Way, with city selection. |
| Weightless in Blue | A swimming journey through a twilight pool, from diving through different swimming strokes to returning to the poolside, accompanied by fish and swaying aquatic plants. |
| Matrix Echo | Chinese verses enter the green code rain character by character. Floating Seal, Kai, Yi and Tibetan characters reveal notes when clicked. Both libraries support editing, JSON extensions and offline export. |

## Developer documentation

[Wallpaper integration guide (Chinese)](docs/wallpaper-adaptation.md) · [Adaptation audit (Chinese)](docs/wallpaper-adaptation-audit.md)

The guide includes the [locale contract](docs/wallpaper-adaptation.md#语言同步v1-的可选扩展) available since Wallpaper Box v0.11.0 and the [wallpaper settings extension](docs/wallpaper-adaptation.md#可选壁纸设置通信) for Wallpaper Box v0.12.0 and later: custom settings pages, one configuration per wallpaper across the device, configuration reads and change events, the settings-page SDK, revision conflicts, and error handling. The base `protocolVersion` remains 1; detect the settings capability separately. Wallpapers that require this extension must declare `minAppVersion: "0.12.0"` or later.

This documentation is synchronized from the app's [settings layout and style commit](https://github.com/whoarei/wallpaper-box/commit/62b0cf1). See the complete [settings-page example](https://github.com/whoarei/wallpaper-box/blob/62b0cf1/docs/examples/wallpaper-settings.html). The guide now covers actual iframe dimensions, shared styling, content scrolling, and space for save controls. Synchronizing the protocol does not add settings pages to every wallpaper in this library; available options depend on each wallpaper's implementation.
