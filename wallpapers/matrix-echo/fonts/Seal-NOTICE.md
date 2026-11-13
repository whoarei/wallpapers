# 字体来源与授权

本仓库的字体文件是对 "Shuowen Seal" （說文篆）字体的子集化版本，
仅保留《通用规范汉字表》一、二级字表（6500 字）中该字体已覆盖的字形，
并转为 WOFF / WOFF2 格式，用于微信小程序「极客百宝」个人印章生成功能的
`wx.loadFontFace` 网络加载。

## 原始字体来源

- "Shuowen Seal" 字体内嵌于 Ivan666jjj/zhuanshu-tools 项目的「篆书卡片.html」
  （https://github.com/Ivan666jjj/zhuanshu-tools）
- 其字形来自以下两处（见该项目「字形来源与授权.md」）：
  1. **开元小篆**（https://github.com/frankslin/kaiyuan-small-seal-font），
     SIL Open Font License 1.1（全文见本仓库 `OFL.txt`）。
     衍生字体不得单独使用 "Kaiyuan" 作为字体名——本子集保留原字体名
     "Shuowen Seal"，未使用 "Kaiyuan"。
  2. **臺灣「全字庫說文解字」**（數位發展部，https://www.cns11643.gov.tw），
     《政府資料開放授權條款－第 1 版》（OGDL-Taiwan-1.0），
     依该条款要求在此具名：字形來源為中華民國數位發展部全字庫說文解字。

## 本仓库的修改

- 仅做子集化（fontTools `pyftsubset`，保留 4752 个字形）与格式转换（WOFF/WOFF2），
  未修改任何字形轮廓。
- 依 OFL 1.1，本仓库随附 OFL 全文；本子集不单独出售。

## 字形覆盖说明

子集覆盖《通用规范汉字表》一、二级 6500 字中本字体已有的 4752 字。
极少数常用字（如韩、董、魏、谭、娜、鑫、婷）原字体即无篆形，
小程序内遇到这些字会自动改用楷体渲染并提示用户。
