---
name: gitee-release-sync
description: 仅在用户明确要求将已发布的 GitHub 壁纸库版本同步到 Gitee、补齐漏传附件、排查 Release 同步失败，或已获授权的新版本发布进入 Gitee 同步阶段时使用。普通开发、测试、提交、推送及仅同步 Git 源码不触发本 skill。复用原版本和原包，校验 Release 附件、清单与默认更新入口。
---

# 同步已发布版本到 Gitee

在 `whoarei/wallpapers` 仓库根目录执行。源为 GitHub `whoarei/wallpapers`，
目标为 Gitee `xishuaiya/wallpapers`。

## 触发边界

- 用户明确要求同步、补齐或排查已发布版本的 Gitee Release，或一次已授权的
  新版发布进入镜像同步阶段时，才进入本流程。
- 普通开发、测试、提交、推送，不启动本流程。不要为了让 Gitee main 跟上
  普通提交，重新同步一个已有 Release。
- 仅要求 Git 源码或分支同步时，按源码同步处理，不派发 `sync-gitee.yml`。
  “同步 Gitee”若上下文只有源码改动，不自动解释成 Release 附件同步。
- 仅编写或修改本 skill 时，只做文件与必要的本地检查，不把 skill 自己执行一遍。
- 只排查或只核验的请求，先执行只读检查，不据此自动派发有写入的同步任务。

这里的“补同步”是把已有正式版的缺失附件补齐并核验，不生成新的内容版本。
需要修改壁纸内容或创建新版本时，使用 [wallpaper-release](../wallpaper-release/SKILL.md)，
由用户决定版本号后再发布。

## 1. 确认目标和现状

先读 `README.md` 的 Gitee 同步说明、`.github/workflows/sync-gitee.yml`、
`scripts/sync_gitee.py`，查看当前源码与运行中的同步任务。

- 用户给出标签时使用该标签；只说“同步最新版”时查询 GitHub 最新正式版。
- 仅接受已发布、非草稿、非预发布的 `library-vX.Y.Z`，清单版本必须一致。
- 不增加库版本或壁纸版本，不重新生成或替换 GitHub 正式包。
- 排查附件时以源 Release 的真实附件集合与 `SHA256SUMS.txt` 为准，数量动态计算。
  Gitee 可能额外显示两个自动源码归档，不能用页面总数判断完整性。

先定位 GitHub Actions 对应运行，区分尚在上传、传输失败、校验冲突、凭证错误、
标签或 main 分歧。GitHub 发布成功不代表 Gitee 已同步完成。

## 2. 启动或恢复同步

正常新版发布由 `library.yml` 直接调用同步流程。
`GITHUB_TOKEN` 创建的 Release 不会触发另一个 `release: published` 工作流，
不要删除这个直接调用而只依赖 Release 事件。

补同步已有版本，或需要使用修复后的脚本时，从 GitHub **main** 派发：

```bash
# release_tag 已按用户目标或最新正式 Release 确定。
gh workflow run sync-gitee.yml --repo whoarei/wallpapers --ref main -f "tag=$release_tag"
gh run list --repo whoarei/wallpapers --workflow sync-gitee.yml --limit 5
```

查询新运行的输入、事件、分支和 `headSha`，确认使用预期 main 提交。
直接重跑旧标签的失败工作流仍会使用旧标签对应的脚本。
工作流全局串行，`cancel-in-progress: false`；已有目标任务在运行时先跟进，
不要连续派发或仅因跨区域上传较慢就取消重来。每次等候不阻断进度更新。
上传进度优先跟踪 GitHub 工作流；不要高频轮询 Gitee 的 Release API，
以免耗尽匿名请求额度。同步完成后再执行一次完整匿名验收。

凭证使用 GitHub Actions 已配置的 `GITEE_TOKEN`，所需权限为 `projects`。
不读取或导出其值，不放进命令参数、URL、日志或仓库。
若 secret 缺失，说明具体设置位置，让用户在 GitHub 设置中配置，不索要聊天明文。

## 3. 理解恢复行为并按原因处理

- 源附件先下载并按 GitHub 校验文件核对；标签推送和 main 更新都不强制覆盖。
- ZIP、封面保持原字节；上传使用系统 curl 流式 multipart，令牌只经 stdin 传递。
  单次上传按文件大小和 8 KiB/s 的保守速率加 5 分钟处理时间计算，最少 20 分钟、最多 60 分钟；单文件最多尝试三次，工作流总时限仍为 90 分钟。
  日志包含上传字节数、耗时与平均速率；大包失败时核对实际传输数据及超时设置。
- 上传响应丢失时，先重新查询同名附件并下载校验，再决定是否重试。
  已有同名、同哈希附件直接复用；不能盲目重复 POST 或删除重传。
- 某个文件遇到可重试的连接错误后，会继续其余附件并报告未完成项。
  所有 ZIP 和封面通过验证后，才上传改写 URL 的 Gitee 清单及重新生成的校验文件。
- 未完成的 Gitee Release 标为预发布，全部验证通过后转为正式版。
  **Gitee `/releases/latest` 仍可能返回预发布**；主程序会拒绝它并保留缓存，
  不能假定预发布一定从 latest 中隐藏。
- 修改 Gitee Release 状态的 PATCH 也需要完整的 `tag_name`、`name`、`body`
  等元数据；维护脚本时保留当前做法。
- 最后把 Gitee main 快进到工作流检出的 GitHub main；标签、main 分歧或同名
  附件哈希冲突时停止并报告具体冲突，不强推、不覆盖正式内容。

修复同步自动化可以提交源码修复，不需要发布新的壁纸库版本。
修复后运行 `python -m unittest discover -s tests -v`，等待 main CI 成功，
再从 main 派发原标签的同步任务。

## 4. 核验与完成标准

工作流成功后，用独立的只读脚本进行公开下载检查：

工作流的“Audit public attachments and update endpoints”步骤也会运行本脚本，
以不携带 Gitee 令牌的 HTTP 请求核验，并保存 `public-release-audit-<tag>` 附件。
可读取该步骤与验收附件作为运行器上的检查证据。当前环境若被接口限流，停止轮询，
遵守服务返回的限制；不要把限流错误当成缺失附件或直接宣称检查通过。

```bash
python scripts/verify_release.py "$release_tag"
```

脚本动态检查：

1. GitHub、Gitee 目标 Release 均存在且为正式版本，附件无遗漏。
2. 每个 ZIP、封面实际公开下载的字节数和 SHA-256，及两端校验文件内容。
3. 两端清单除真实 Gitee 下载/封面 URL 外完全一致，版本、ZIP 哈希与大小正确。
   Gitee 的清单和校验文件因 URL 改写而与 GitHub 字节不同，这是预期行为。
4. 两端 main、目标标签及解析后的提交相同。
5. GitHub latest 稳定清单和 Gitee `/api/v5/repos/xishuaiya/wallpapers/releases/latest`
   均指向目标正式版，实际返回的清单可用。

只补历史版本时使用：

```bash
python scripts/verify_release.py "$release_tag" --historical
```

历史检查不要求 latest 回退到旧版；它会明确标注未检查 latest。
不要为了验证旧版把旧 Release 设置成最新版。默认最新版是否正常，另对当前最新版
运行不带 `--historical` 的检查。

若核验失败，按具体缺失文件、冲突或接口返回定位，不能用“任务成功”代替检查。
完整同步后报告标签、动态计算的已验附件数量、默认入口状态和 Gitee Release 链接。
如仍有阻塞，明确剩余项，不能宣称全部完成。
