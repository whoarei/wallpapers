# 项目约定

发布壁纸库新版本时，先阅读并遵循 [.agents/skills/wallpaper-release/SKILL.md](.agents/skills/wallpaper-release/SKILL.md)。仅修改文档、skill 或发布自动化，不修改内容版本、不创建发布标签、不发布新版本。

## 发布目标

- 以后只向 GitHub `whoarei/wallpapers` 发布。
- Gitee 已永久停止同步，包括源码、分支、标签、Release、ZIP、封面与清单；普通的发布、推送、更新或协议文档同步请求均不包含 Gitee。
- 不派发、重跑或恢复历史 Gitee 工作流，不执行补传、镜像修复或同步脚本，不重新创建自动或手动同步入口。
- 发布验收以 GitHub 正式 Release、公开附件校验和 latest 入口为准，Gitee 状态不属于完成条件。
- 保留 Gitee 上已有仓库及附件，不为本规则修改其历史内容。客户端读取已有 Gitee 仓库的能力按原状保留。
