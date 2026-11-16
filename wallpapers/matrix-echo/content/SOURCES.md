# 诗词与文字来源

本库包含 10,045 首作品、9,446 条悬浮文字记录：3,500 条楷书、4,752 条小篆、
1,164 个彝文音节和 30 个藏文基本字母。汉字数量与字形记录分别统计；
同一汉字的楷书、小篆是两条记录，不算两个不同汉字。

## 诗词

主要数据来自 [chinese-poetry/chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)，
固定版本 `b8594f81a89752241442f2ce267d6f66f96704ee`，保留上游 MIT 授权，
见 [许可证](licenses/chinese-poetry-MIT.txt)。每条新增作品的 `source` 指向固定版本的
原始文件，并附上游 ID 或原始数组的零基下标；下载文件的 SHA-256 记录在
[导入报告](import-report.json)。选集名称指数据源版本，不据名称假定条目数。

| 选集 | 篇数 |
| --- | ---: |
| 诗经 | 305 |
| 楚辞 | 64 |
| 曹操诗集 | 26 |
| 唐诗三百首 | 352 |
| 宋词三百首 | 280 |
| 千家诗 | 200 |
| 花间集 | 497 |
| 南唐二主词 | 44 |
| 全唐诗选 | 4,320 |
| 宋诗选 | 2,070 |
| 宋词选 | 1,002 |
| 元曲选 | 600 |
| 纳兰词 | 257 |
| 历代名篇 | 22 |
| 原有内置精选 | 6 |

其中“历代名篇”补充汉乐府、古诗十九首、阮籍、陶渊明、左思、鲍照、谢朓、
王籍及元明清代表作品，逐篇记录古籍出处和采用的通行异文。原有六首作品保留
文件名、稳定 ID 和录文，包括《念奴娇》的“人生如梦，一尊还酹江月”。

导入使用 OpenCC 0.1.7 的 `t2s` 转为简体；若某个生僻简体字不在随包字体中，
保留能显示的繁体对应字，例如《诗经》中的豵。整理空白，补齐源数据缺失的句末
标点，按连续原文合并冒号或逗号结尾的段落。作品不为满足配额而截短，
不拼接不同作品；元曲排除有明确剧目或折次标记的戏剧片段。
重复正文、缺字占位符、不支持的字形及不合格式的记录均报告后跳过。
题材标签沿用数据源已有标签，没有标签的作品仍可按朝代、作者和选集查找。

这些检查验证格式、重复和离线字形，不代表逐首完成文献校勘。
数据源中的异文沿用录文；修改时请保留出处并说明所用版本。

## 汉字

常用字范围使用 [rime-aca/character_set 的《通用规范汉字表》](https://github.com/rime-aca/character_set/blob/05db9d8194448d0ed2c916a89c62a7a0bda60c30/通用規範漢字表.txt)
一级字表，固定版本 `05db9d8194448d0ed2c916a89c62a7a0bda60c30`，共 3,500 字，
见 [字表](common-hanzi.txt)。楷书逐字覆盖此表；小篆逐字覆盖实际随包字体的
4,752 个汉字。未增加字体，也不以系统替代字体冒充小篆。

汉字读音和字义主要整理自 [pwxcoo/chinese-xinhua](https://github.com/pwxcoo/chinese-xinhua)，
固定版本 `fe6d6c2e8baa82187f4c96bbe042e43f96c05666` 的 `data/word.json`，
保留其 [MIT 许可证](licenses/chinese-xinhua-MIT.txt)。上游说明数据收集自网络，
这里保留来源，不将其视作权威字典定本。

注释提取完整的简明义项，不机械截断长释义，不采纳开头未经复核的字源推断。
缺条、缺释义及部分多音字以编者简注补齐，源文件为
`scripts/data/matrix-glyph-notes.json`，对应记录明确标注“编者简注”。
每个小篆条目的读音和释义解释其对应汉字，不据篆形外观编造字源。
原有汉字记录的稳定 ID 保留，部分注释补充常用多音读法。

## 彝文与藏文

采用 Unicode 15.0 字符名作为音节名或字母名；依据随包 Noto 字体的 `cmap`
逐字校验。彝文包含 U+A000–U+A48C 中的 1,164 个完整音节字，排除
U+A015 重复符号。藏文收录三十个基本字母，不把梵文增补字母、下加字或
独立元音附标混为基本字母。音节或字母本身不作固定汉语词义的意译。
保留 [Unicode 许可证](licenses/Unicode-license.txt)。

## 重建和继续扩充

```sh
python -m pip install -r scripts/requirements-content.txt
python scripts/import_matrix_corpus.py --cache /tmp/matrix-corpus-cache
python scripts/sync_matrix_poetry.py
python scripts/sync_matrix_glyphs.py
python scripts/sync_matrix_settings.py
```

只有显式运行导入工具时才下载上游资料。壁纸运行、搜索和播放全部离线。
缓存应来自固定版本的原始文件，校验和见导入报告。重复执行导入保留既有记录，
新记录以稳定 ID 增补；编者简注以 `scripts/data/matrix-glyph-notes.json` 为准。
人工整理作品在 `scripts/data/matrix-classics.json` 中维护。

源码仍为每首作品、每条文字一个 JSON。同步工具按每片最多 256 条生成 `data/`
中的脚本，两个 `*.generated.js` 保存清单；打包时始终从 JSON 重新生成。
正式壁纸包不重复包含逐条 JSON，以满足宿主 4,096 个文件限制；源码和仓库
文件 ZIP 仍保留逐条文件。已配置壁纸导出使用相同分片和全部授权文件。
