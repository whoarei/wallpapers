# Offline font assets

These fonts are bundled for offline use. No font CDN is contacted.

- `Seal.woff`: 4,752-character upstream subset of **Shuowen Seal**, obtained from
  https://github.com/LiaBrio/seal-fonts (`ShuowenSeal-Subset.woff`).
  The upstream WOFF is bundled unchanged, covering more Han characters for JSON extensions.
  See `Seal-OFL.txt` and `Seal-NOTICE.md` for licensing, upstream sources,
  and the required attribution to 全字庫說文解字 / 中華民國數位發展部.
- `WenKai.woff`: **LXGW WenKai Regular**, full font converted from TTF to WOFF
  without outline changes. https://github.com/lxgw/LxgwWenKai
  See `WenKai-OFL.txt` (SIL OFL 1.1). Used for complete verses and Kai glyphs.
- `Yi.woff`: **Noto Sans Yi Regular**, full font converted from TTF to WOFF.
- `Tibetan.woff`: **Noto Serif Tibetan Regular**, full font converted from TTF to WOFF.
  Both from https://github.com/notofonts/noto-fonts/tree/main/hinted/ttf
  under SIL OFL 1.1; see `Noto-OFL.txt` and embedded font copyright notices.

Floating Yi samples are complete Yi syllabograms. Tibetan samples are complete
base letters, not detached vowel marks or random fragments of shaped words.
Seal characters are restricted to the verified subset; other fonts are loaded
before their floating glyphs appear. A missing font is reported in the manager.
