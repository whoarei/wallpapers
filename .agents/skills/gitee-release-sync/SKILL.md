---
name: gitee-release-sync
description: 已停用的历史 Gitee 同步 skill。用户已要求以后不再同步 Gitee；此文件仅记录停用约定，不提供或执行同步、补传、重试或恢复流程。
---

# Gitee 同步已永久停用

以后只向 GitHub `whoarei/wallpapers` 发布。Gitee `xishuaiya/wallpapers`
永久停止源码、分支、标签、Release、ZIP、封面与清单同步。

- 不派发、重跑或恢复历史 Gitee 工作流，不执行 `scripts/sync_gitee.py` 或手工补传。
- 自动与手动工作流入口均已移除，不重新创建同步入口。
- 普通的发布、推送、更新或协议文档同步请求不包含 Gitee，也不以 Gitee 状态作为验收条件。
- 保留 Gitee 已有仓库与附件。历史脚本和测试仅用于维护历史实现，不属于当前发布流程。
- 仅修改此 skill、相关约定或工作流时，完成文件修改和必要静态检查即可，不触发发布或线上同步验收。

壁纸库新版发布遵循 [wallpaper-release](../wallpaper-release/SKILL.md)，
只核验 GitHub 正式 Release、公开附件与 latest 入口。
