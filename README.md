# 壁纸盒子 · 官方壁纸库

程序仓库：[whoarei/wallpaper-box](https://github.com/whoarei/wallpaper-box)。本仓库只发布壁纸内容，面向壁纸盒子 0.2.0 及后续版本。

稳定目录入口：

```text
https://github.com/whoarei/wallpapers/releases/latest/download/catalog.json
```

程序匿名读取公开清单；用户无需 GitHub 登录。检查更新时只获取 `catalog.json`。每张壁纸都有独立 ZIP，用户点击哪张，就只下载或更新对应的一个包；已安装的壁纸离线也能运行。清单包含独立版本、最低程序版本、ZIP 下载地址、字节数与 SHA-256。程序下载、校验并在临时目录解压，完成验证后才激活新版本，保留上一版本以供回退。

## 添加壁纸

当前壁纸包括：静水之间、松风镇、通往别处的窗户、像素露营地、深空观测站、雨夜列车和云端浮岛。新增内容仍独立打包，浏览目录不自动下载整库。

| 壁纸 | 场景 |
| --- | --- |
| 像素露营地 | 帐篷、篝火、溪流与萤火虫，昼夜缓慢变化 |
| 深空观测站 | 蓝色行星、卫星轨道、星空与本地时钟 |
| 雨夜列车 | 车厢暖光、玻璃雨滴与车窗外流动的城市 |
| 云端浮岛 | 空中岛屿、瀑布、飞艇与流动云海 |

复制一个目录到 `wallpapers/<id>/`，包含 `index.html` 和 `module.json`，图片、脚本、字体都使用相对路径。像素、Canvas 和 WebGL 场景都按同一规范运行。

```json
{
  "schemaVersion": 1,
  "id": "my-wallpaper",
  "type": "web",
  "name": "我的壁纸",
  "version": "1.0.0",
  "minAppVersion": "0.2.0",
  "entry": "index.html",
  "cover": "cover.jpg",
  "description": "壁纸说明",
  "tags": ["像素"]
}
```

## 发布内容更新

1. 修改或加入壁纸；修改文件时增加该壁纸 `module.json` 的 `version`。
2. 增加 `library.json` 的库版本；壁纸版本和库版本独立。
3. 运行 `python scripts/build.py` 检查清单与 ZIP。
4. 提交后推送 `library-vX.Y.Z` 标签，版本须与 `library.json` 一致。
5. GitHub Actions 生成 ZIP、封面、catalog.json 和 SHA256SUMS.txt，再发布 Release。稳定入口随最新正式 Release 更新。

主分支和 PR 只验证，不自动发布。已有正式 Release 不覆盖。相同壁纸版本不允许改变包内容；程序版本不兼容的条目会提示升级程序。

当前规范仅支持网页壁纸；不允许 ZIP 路径穿越、符号链接或 Windows 保留文件名。壁纸包不携带可调用程序管理命令的权限。
