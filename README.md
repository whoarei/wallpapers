# 壁纸盒子 · 官方壁纸库

**简体中文** | [English](README.en.md)

这里收录了「壁纸盒子」的官方动态壁纸，涵盖像素小镇、自然风景、海底世界与实时星空等主题。在 [壁纸盒子](https://github.com/whoarei/wallpaper-box) 中即可浏览、按需下载和切换壁纸，已安装的壁纸可离线使用。

也可前往 [GitHub Releases](https://github.com/whoarei/wallpapers/releases) 或 [Gitee Releases](https://gitee.com/xishuaiya/wallpapers/releases) 下载壁纸包。

## 壁纸列表

| 壁纸 | 简介 |
| --- | --- |
| 松风镇 | 像素风林间小镇，小火车穿行其间，天色随昼夜流转，还能点击种花。 |
| 静水之间 | 草木与微光环绕的水族箱，鱼群悠游、彩蟹挥钳，支持点击投喂，偶有鲨鱼来访。 |
| 通往别处的窗户 | 窗外是远山、湖面与缓缓飘动的云，可切换晴雨天气。 |
| 像素露营地 | 松林中的帐篷、篝火、溪流与萤火虫，陪伴缓慢变化的天色。 |
| 云端浮岛 | 浮岛与瀑布悬于云海之上，飞艇慢行，风车与草木随风轻摆。 |
| 深空观测站 | 舷窗外的蓝色行星、星轨与流星，搭配本地时钟，营造安静的太空氛围。 |
| 雨夜列车 | 暖色车厢、玻璃雨滴与窗外流动的城市灯火，仿佛置身夜行列车。 |
| 蔚蓝漫游 | 随天气与昼夜变化的海底长卷，穿行珊瑚花园、海藻森林与深海，轻点泛起荧光涟漪，触碰动物会让它们游开。 |
| 此刻星空 | 根据所选位置与真实时间展示星空，包含 5044 颗恒星、星座与银河方向，支持选择城市。 |
| 蓝色失重 | 暮色泳池中的游泳旅程，从跳水、多种泳姿到归岸，伴有鱼群与摇曳的水草。 |
| 矩阵回声 | 诗句逐字融入绿色代码雨，篆书、楷书与彝藏文字悬浮其上；点击文字查看注释，诗词与悬浮文字均支持管理、JSON 扩充及离线导出。 |

## 开发者文档

[壁纸适配规范](docs/wallpaper-adaptation.md) · [逐张适配检查与验证](docs/wallpaper-adaptation-audit.md)

规范包含主程序 v0.11.0 起的[语言同步约定](docs/wallpaper-adaptation.md#语言同步v1-的可选扩展)，以及面向主程序 v0.12.0+ 的[壁纸设置通信扩展](docs/wallpaper-adaptation.md#可选壁纸设置通信)：自定义设置页、设备共享配置、配置读取与变更事件、设置页 SDK、版本冲突和错误处理。基础 `protocolVersion` 仍为 1，扩展需要单独检测设置能力；强依赖设置扩展的壁纸应声明 `minAppVersion: "0.12.0"` 或更高版本。

文档同步自主程序 [设置页规范与容器改进提交](https://github.com/whoarei/wallpaper-box/commit/62b0cf1)。可参考主程序的[设置页示例](https://github.com/whoarei/wallpaper-box/blob/62b0cf1/docs/examples/wallpaper-settings.html)；规范现已包含 iframe 实际尺寸、统一风格、内容滚动与操作栏要求，并提供完整模板。此处同步接入规范，不表示所有在库壁纸已提供设置页，具体设置项以各壁纸实现为准。

为「矩阵回声」增加诗词，可直接提交 JSON 文件，见 [诗词库说明](wallpapers/matrix-echo/content/poems/README.md)。
增加悬浮文字与注释同样支持 JSON，见 [悬浮文字库说明](wallpapers/matrix-echo/content/glyphs/README.md)。

矩阵回声已接入主程序 v0.12.0+ 的「壁纸设置」入口，可管理、导入诗词和悬浮文字注释，
保存后同步各屏幕及预览。配置容量上限 32 KiB，旧版宿主和普通浏览器继续使用原有本地配置。
