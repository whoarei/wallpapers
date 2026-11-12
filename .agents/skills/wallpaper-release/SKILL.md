---
name: wallpaper-release
description: 发布 whoarei/wallpapers 壁纸库新版。用于壁纸新增、内容更新、准备版本或发布 Release；先向用户展示更新点、推荐版本与其他选项，由用户最终决定库版本及变更壁纸的独立版本，再测试、打包、发布 GitHub 并衔接 Gitee 同步。只补同步已有版本时使用 gitee-release-sync。
---

# 壁纸库新版发布

在 `whoarei/wallpapers` 仓库根目录执行。本 skill 发布壁纸内容，主程序
`whoarei/wallpaper-box` 的安装包发布不在此流程内。

## 先读当前实现

- `README.md` 的“发布内容更新”和“配置 Gitee Release 同步”。
- `library.json`、本次变更壁纸的 `wallpapers/<id>/module.json`。
- `.github/workflows/library.yml`、`.github/workflows/sync-gitee.yml`。
- `scripts/build.py`、`scripts/sync_gitee.py`。

检查工作区、当前分支、GitHub 最新正式 Release 及现有标签。保留用户已有改动。
以本次读取的实现为准；不要沿用旧任务中的版本、附件数量或提交 SHA。

## 1. 准备改动并让用户决定版本

先完成可独立推进的实现、内容检查和适当测试，整理成可审阅的更新点。
**修改任何待发布版本号、创建发布标签之前，必须让用户最终确定版本号。**
这是用户明确指定的工作方式；“开始推进”“直到发布”等笼统授权不能代替版本选择。
如果用户已在本次任务中明确指定版本，复用该选择，不重复询问。

向用户一次列清：

1. 相对上一正式版的更新点和实际影响。
2. 当前库版本，以及每张有内容改动的壁纸的当前独立版本。
3. 推荐的下一组版本号及理由。
4. 其他合理选项及各自含义，请用户最终选择或自行指定。

例如当前库为 `1.12.0`、某壁纸为 `1.1.0`，新增功能可建议
“库 `1.13.0` / 壁纸 `1.2.0`”；若改动范围适合修订版，可同时提供
“库 `1.12.1` / 壁纸 `1.1.1`”并解释取舍。这只是示例，不能直接套用。
不兼容变更才建议主版本升级，不能为了凑选项推荐错误的版本。

等用户回复时继续不依赖版本选择的工作；不要把等待超时视为确认。
选定版本应高于相应已发布版本、尚未占用，符合 `X.Y.Z` 格式。
若用户选择与已发布包或标签冲突，说明具体冲突并请其重选，不静默换号。

用户确定后才修改：

- `library.json.version`：本次内容发布的库版本。
- 有文件变化的壁纸 `module.json.version`：各自的独立版本。
- 必要时更新 `minAppVersion`，依据实际主程序能力，说明兼容性影响。

未改动的壁纸保持原版本；同一壁纸版本不能对应不同 ZIP 内容。
仅修改文档、skill 或发布自动化，不需要创建新的内容版本或发布标签。

## 2. 测试和确定性打包

默认检查与当前发布 CI 对齐：

```bash
python -m unittest discover -s tests -v
node tests/zenith-sky.test.cjs
node tests/blue-weightless.test.cjs
```

针对有内容变化的壁纸，运行其适用的浏览器检查，并实际查看关键画面。
人物美术更新要逐一检查脸、手足、姿态衔接、遮挡及多尺寸构图；
检查离线素材、交互、暂停、后台停止和 GPU 回退等实际受影响的功能。
不因文档或 skill 改动重跑无关浏览器检查。

用 GitHub 最新正式版的清单作基线。先确认查询成功及版本状态；
网络、权限错误不能当成“首次发布”。以下命令在已存在正式版时执行：

```bash
release_previous_dir="$(mktemp -d)"
gh release download --repo whoarei/wallpapers --pattern catalog.json --dir "$release_previous_dir"
python scripts/build.py --previous "$release_previous_dir/catalog.json"
(cd dist && sha256sum --strict -c SHA256SUMS.txt)
```

只有明确确认仓库从未发布过正式版，才省略 `--previous`。
打包器会清理 `dist/`，不要把手工文件放进去。
不要为了绕过“相同版本内容改变”检查而修改旧清单或重新上传旧正式包。
必要时解压实际生成的 ZIP，使用支持 `WALLPAPER_ROOT` 的检查测试正式包。

## 3. 发布 GitHub Release

1. 检查 diff、确认用户选定的版本和最终变更一致，再提交并推送相应源码。
   如最终范围发生变化，重新给出更新点和版本建议，由用户确认调整。
2. 等待对应提交的主分支 CI 成功。主分支和 PR 只验证，不发布。
3. 根据已经确认的 `library.json.version` 得出标签，核对其尚未占用。
   标签必须指向已验证的内容提交，不得移动已有发布标签。

   ```bash
   release_tag="$(python -c 'import json; print("library-v" + json.load(open("library.json"))["version"])')"
   git tag -a "$release_tag" -m "Wallpaper library $release_tag"
   git push origin "refs/tags/$release_tag"
   ```

4. 查到本次标签触发的 **Wallpaper library** 工作流，核对 `headSha`
   是预期提交。等打包、GitHub 发布和后续 Gitee 同步完成。
5. 使用准确的更新点整理 Release 标题、说明；多行内容用临时文件配合
   `gh release edit --notes-file`，不通过 shell 字符串拼接发布正文。

CI 上传草稿附件后会下载验证，再发布为 latest。已有正式 Release 不覆盖。
不要另走手工重打包、覆盖正式附件的路径。

## 4. 衔接 Gitee 同步与验收

继续读取并执行 [gitee-release-sync](../gitee-release-sync/SKILL.md) 的
“核验与完成标准”。正常发布由 `library.yml` 直接调用同步工作流；
已有任务正在同步时不要重复派发。

```bash
python scripts/verify_release.py "$release_tag"
```

**两端均为正式版本、所有附件及清单校验通过、main 和标签一致、默认更新入口
返回目标最新版后，才算完整发布。** GitHub 成功但 Gitee 尚在运行或失败时，
准确报告当前状态并继续处理；不能只凭任务已启动或 Release 页面存在就说完成。

最后简要报告用户选定的库版本、变更壁纸版本、更新点、验证结果及两端 Release 链接。
