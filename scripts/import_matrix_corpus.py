"""Import a pinned, reproducible offline corpus; never runs in the wallpaper.

Install scripts/requirements-content.txt, then run with --cache /path/to/cache.
Existing records are preserved. Generated source records have stable content IDs.
"""
import argparse
import concurrent.futures
import hashlib
import json
import re
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

from matrix_glyphs import font_coverage, identity as glyph_id, normalize as glyph_normalize, woff_codepoints
from matrix_poetry import field, records as poem_records
from matrix_poetry import identity as poem_identity
from matrix_content import MAX_VERSES

ROOT = Path(__file__).resolve().parent.parent
POETRY_REV = "b8594f81a89752241442f2ce267d6f66f96704ee"
DICTIONARY_REV = "fe6d6c2e8baa82187f4c96bbe042e43f96c05666"
CHARSET_REV = "05db9d8194448d0ed2c916a89c62a7a0bda60c30"
POETRY = f"https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/{POETRY_REV}/"
DICTIONARY = f"https://raw.githubusercontent.com/pwxcoo/chinese-xinhua/{DICTIONARY_REV}/"
CHARSET = f"https://raw.githubusercontent.com/rime-aca/character_set/{CHARSET_REV}/"
TARGET = 10000


def download(cache, key, url, hashes):
    target = cache / key
    if not target.exists():
        data = urllib.request.urlopen(urllib.parse.quote(url, safe=":/"), timeout=45).read(40 * 1024 * 1024)
        temporary = target.with_suffix(".download")
        temporary.write_bytes(data)
        temporary.replace(target)
    data = target.read_bytes()
    hashes[url] = hashlib.sha256(data).hexdigest()
    return data.decode("utf-8-sig")


def save(path, record):
    data = (json.dumps(record, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if not path.exists():
        path.write_bytes(data)


def dictionary_note(row):
    """Keep complete modern sense lines; omit unreviewed etymological claims."""
    character = row["word"]
    text = unicodedata.normalize("NFC", row["explanation"]).replace("ɡ", "g")
    text = re.sub(r"[\x00-\x08\x0b-\x1f\x7f-\x9f]", "", text)
    # The source's final numbered entry is shorter and includes polyphonic senses.
    headings = list(re.finditer(r"(?m)^" + re.escape(character) + r"(?:（[^\n]+?）)?[a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+", text))
    if headings:
        compact = text[headings[0].start():]
        lines = [re.sub(r"\s+", " ", line).strip() for line in compact.splitlines()]
        lines = [line for line in lines if line and not re.fullmatch(r"[⒈-⒛①-⑳]", line)]
    else:
        # Some source explanations are truncated. The separate 'more' field has
        # the compact dictionary entry at its end, following a Zhuyin header.
        more = unicodedata.normalize("NFC", row.get("more", "")).replace("ɡ", "g")
        blocks = list(re.finditer(r"(?m)^" + re.escape(character) + r"[0-9]*\n[^\n]*[ㄅ-ㄩ][^\n]*\n", more))
        if blocks:
            compact = more[blocks[0].start():]
            lines = [line.strip() for line in compact.splitlines()
                     if line.strip() and not re.match(r"^(郑码|笔画数|笔顺|汉字编码)", line)]
        else:
            # Extract only independently readable sense lines, not the opening
            # speculative character-origin paragraph or incomplete examples.
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            lines = [line for line in lines[1:] if 2 <= len(line) <= 100
                     and not re.search(r"[()（）]|--|《|》|本义|字形|象形|形声|会意|又如|同本义|^又$|^如$", line)]
    selected, marker, pronunciation = [], "", ""
    for line in lines:
        sound = re.fullmatch(r"([a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+).*?[ㄅ-ㄩ].*", line)
        if sound:
            pronunciation = sound.group(1) + '：'; continue
        if line == character:
            continue
        if re.fullmatch(r"\(\d+\)", line):
            marker = line; continue
        if not re.search(r"[\u3400-\u9fff]", line.replace(character, "")):
            continue
        line = pronunciation + marker + line; marker = ""; pronunciation = ""
        if len(line) > 300:
            continue
        if sum(len(s) + 1 for s in selected) + len(line) > 550:
            break
        selected.append(line)
    if not selected or not any(re.search(r"[\u3400-\u9fff]", line.replace(character, "")) for line in selected):
        raise ValueError("no complete definition")
    return "\n".join(selected)


def dictionary_readings(row):
    text = unicodedata.normalize('NFC', row.get('more', '') + '\n' + row['explanation']).replace('ɡ', 'g').replace('ɑ', 'a')
    syllable = r'[a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]{1,8}'
    readings = [unicodedata.normalize('NFC', row['pinyin']).replace('ɡ', 'g').replace('ɑ', 'a')]
    readings += re.findall(r'(?m)^' + re.escape(row['word']) + r'\d*\n(' + syllable + r')[ \u3000]+[ㄅ-ㄩ]', text)
    readings += re.findall(r'(?m)^' + re.escape(row['word']) + r'(?:（[^\n]+?）)?[ \t]*(' + syllable + r')(?=\s|[⒈-⒛]|$)', text)
    result = []
    for reading in readings:
        plain = lambda text: ''.join(c for c in unicodedata.normalize('NFD', text) if not unicodedata.combining(c))
        if reading != readings[0] and reading == plain(reading) and any(plain(r) == reading for r in result): continue
        if reading not in result and len('；'.join(result + [reading])) <= 80: result.append(reading)
    return '；'.join(result)


def run(cache, refresh_dictionary=False):
    from opencc import OpenCC
    cc = OpenCC("t2s")
    traditional = OpenCC("s2t")
    folder = ROOT / "wallpapers/matrix-echo"
    cache.mkdir(parents=True, exist_ok=True)
    hashes, rejected = {}, Counter()
    def fetch(path):
        return json.loads(download(cache, path.replace("/", "__"), POETRY + path, hashes))
    paths = ["诗经/shijing.json", "楚辞/chuci.json", "曹操诗集/caocao.json", "蒙学/qianjiashi.json",
             "全唐诗/唐诗三百首.json", "宋词/宋词三百首.json", "五代诗词/nantang/poetrys.json",
             "纳兰性德/纳兰性德诗集.json", "元曲/yuanqu.json"]
    paths += [f"五代诗词/huajianji/huajianji-{i}-juan.json" for i in [1, 2, 3, 4, 5, 6, 7, 8, 9, "x"]]
    paths += [f"全唐诗/poet.tang.{i}.json" for i in range(0, 56000, 5000)]
    paths += [f"全唐诗/poet.song.{i}.json" for i in range(0, 241000, 30000)]
    paths += [f"宋词/ci.song.{i}.json" for i in range(0, 21000, 2000)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        raw = dict(zip(paths, pool.map(fetch, paths)))
    # A full regular poem is retained; no text is clipped to satisfy a quota.
    font = woff_codepoints(folder / "fonts/WenKai.woff")
    def canonical(author, paragraphs):
        text = cc.convert(author + ''.join(paragraphs))
        text = ''.join(traditional.convert(c) if ord(c) not in font and len(traditional.convert(c)) == 1
                       and ord(traditional.convert(c)) in font else c for c in text)
        return re.sub(r'\W', '', text)
    existing, _ = poem_records(folder)
    imported = {p["id"]: p for p in existing}
    seen = {canonical(p['author'], p['verses']) for p in existing}
    def add(value, path, collection, dynasty, ordinal):
        author = cc.convert(value.get("author", "曹操" if "曹操" in path else "佚名")).strip()
        paragraphs = value.get("paragraphs", value.get("content", value.get("para", [])))
        if not isinstance(paragraphs, list) or not all(isinstance(v, str) for v in paragraphs):
            rejected["正文格式"] += 1; return False
        verses = []
        pending = ""
        for paragraph in paragraphs:
            paragraph = cc.convert(re.sub(r"\s+", "", paragraph)).replace("?", "？").replace("!", "！")
            # Modern rare simplified forms can lie outside the bundled font.
            # Preserve their traditional equivalents, rather than lose the poem.
            paragraph = ''.join(traditional.convert(c) if ord(c) not in font and len(traditional.convert(c)) == 1
                                and ord(traditional.convert(c)) in font else c for c in paragraph)
            if not paragraph:
                continue
            pending += paragraph
            if pending[-1] not in "，、：；":
                if pending[-1] not in "。？！’”」』": pending += "。"
                verses.append(pending); pending = ""
        if pending: verses.append(pending + "。")
        title = cc.convert(value.get("title", value.get("rhythmic", ""))).strip()
        if not value.get("title") and verses:
            title += "·" + re.split(r"[，。？！]", verses[0])[0][:22]
        if "楚辞" in path and value.get("section") and value["section"] != value.get("title"):
            title = cc.convert(value["section"]) + "·" + title
        key = re.sub(r"\W", "", author + "".join(verses))
        if key in seen:
            rejected["重复正文"] += 1; return False
        if not verses or len(verses) > MAX_VERSES or any(len(v) > 120 for v in verses):
            rejected["句长或篇幅"] += 1; return False
        if any(c in "□�○◯〓" or unicodedata.category(c) == "Co" for c in "".join(verses)):
            rejected["原文缺字"] += 1; return False
        if any(ord(c) not in font for c in "".join(verses) if not c.isspace()):
            rejected["离线字体未覆盖"] += 1; return False
        try:
            title = field(title, "title", 80); author = field(author, "author", 40)
        except ValueError:
            rejected["标题或作者格式"] += 1; return False
        identifier = "poem-" + hashlib.sha256(key.encode()).hexdigest()[:24]
        if identifier in imported: return False
        tags = [cc.convert(t) for t in value.get("tags", []) if isinstance(t, str) and 0 < len(t) <= 30][:12]
        record = dict(id=identifier, title=title, author=author, dynasty=dynasty, verses=verses,
                      enabled=True, collection=collection, tags=tags,
                      source=f"https://github.com/chinese-poetry/chinese-poetry/blob/{POETRY_REV}/{path}#record-{value.get('id', ordinal)}")
        imported[identifier] = record; seen.add(key)
        return True
    def consume(path, collection, dynasty, limit=None, values=None):
        count = 0
        values = raw[path] if values is None else values
        # Spread selections across each source, rather than taking an author's
        # first thousand records. Hash order is deterministic across machines.
        if limit is not None:
            values = sorted(values, key=lambda v: hashlib.sha256(json.dumps(v, ensure_ascii=False, sort_keys=True).encode()).digest())
        for ordinal, value in enumerate(values):
            if len(imported) >= TARGET and collection in ["全唐诗选", "宋诗选", "宋词选", "元曲选"]: break
            if add(value, path, collection, dynasty, ordinal): count += 1
            if limit is not None and count >= limit: break
    for path, collection, dynasty in [
        (paths[0], "诗经", "先秦"), (paths[1], "楚辞", "先秦"), (paths[2], "曹操诗集", "汉"),
        (paths[4], "唐诗三百首", "唐"), (paths[5], "宋词三百首", "宋"),
        (paths[6], "南唐二主词", "五代"), (paths[7], "纳兰词", "清")]:
        consume(path, collection, dynasty)
    for section in raw[paths[3]]["content"]:
        for value in section["content"]:
            value = dict(value, title=value["chapter"])
            match = re.match(r"[（(]([^）)]+)[）)](.+)", cc.convert(value["author"]))
            dynasty, author = match.groups() if match else ("", value["author"])
            add(dict(value, author=author), paths[3], "千家诗", dynasty, value["chapter"])
    for path in paths:
        if "huajianji-" in path: consume(path, "花间集", "五代")
    # Yuan drama fragments are not standalone poems; include only independent
    # sanqu records, excluding titles that identify acts or dramatic song suites.
    yuan = [v for v in raw[paths[8]] if not re.search(r"・|杂剧|第[一二三四五六七八九十]折|楔子", v.get("title", ""))]
    consume(paths[8], "元曲选", "元", 600, yuan)
    for path in paths:
        if "poet.tang." in path: consume(path, "全唐诗选", "唐", 360)
        elif "poet.song." in path: consume(path, "宋诗选", "宋", 230)
        elif "ci.song." in path: consume(path, "宋词选", "宋", 210)
    for path in paths:
        if len(imported) >= TARGET: break
        if "poet.tang." in path: consume(path, "全唐诗选", "唐")
    if len(imported) < TARGET: raise ValueError(f"Only {len(imported)} valid poems; no records were written")
    existing_ids = {p['id'] for p in existing}
    refreshed = set()
    # Preserve the original array position even when a quota selected records in
    # hash order. A source reference must lead back to the actual raw record.
    for path, values in raw.items():
        if not isinstance(values, list): continue
        prefix = f'https://github.com/chinese-poetry/chinese-poetry/blob/{POETRY_REV}/{path}#record-'
        selected = {canonical(p['author'], p['verses']): p for p in imported.values() if p.get('source', '').startswith(prefix)}
        if not selected: continue
        for ordinal, value in enumerate(values):
            paragraphs = value.get('paragraphs', value.get('content', value.get('para', [])))
            if not isinstance(paragraphs, list) or not all(isinstance(v, str) for v in paragraphs): continue
            author = cc.convert(value.get('author', '曹操' if '曹操' in path else '佚名')).strip()
            record = selected.get(canonical(author, paragraphs))
            if not record: continue
            dynasty = record['dynasty']
            if path.startswith('楚辞/'):
                dynasty = '先秦' if author in ['屈原', '宋玉', '景差'] else '汉'
            elif author in ['李煜', '李璟', '冯延巳']:
                dynasty = '五代'
            elif 'huajianji' in path and author in ['温庭筠', '皇甫松']:
                dynasty = '唐'
            source = prefix + str(value.get('id', ordinal))
            if record.get('source') != source or record['dynasty'] != dynasty:
                record['source'] = source; record['dynasty'] = dynasty; refreshed.add(record['id'])
    for identifier, record in imported.items():
        target = folder / "content/poems" / (identifier + ".json")
        if identifier in refreshed:
            target.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        elif identifier not in existing_ids: save(target, record)
    for record in json.loads((ROOT / 'scripts/data/matrix-classics.json').read_text(encoding='utf-8')):
        key = re.sub(r"\W", "", cc.convert(record['author'] + ''.join(record['verses'])))
        if key not in seen:
            identifier = poem_identity(record['title'], record['author'])
            record = dict(record, id=identifier)
            save(folder / 'content/poems' / (identifier + '.json'), record)
            imported[identifier] = record; seen.add(key)

    dictionary = json.loads(download(cache, "dictionary.json", DICTIONARY + "data/word.json", hashes))
    dictionary = {r["word"]: r for r in dictionary if len(r["word"]) == 1}
    table = download(cache, "standard.txt", CHARSET + "通用規範漢字表.txt", hashes)
    common = [line.strip() for line in table.split("# 二級字表")[0].splitlines() if len(line.strip()) == 1]
    assert len(common) == 3500 and len(set(common)) == 3500
    (folder / "content/common-hanzi.txt").write_text("".join(common) + "\n", encoding="utf-8")
    coverage = font_coverage(folder)
    existing_glyphs = [json.loads(p.read_text()) for p in (folder / "content/glyphs").glob("*.json")]
    existing_by_pair = {(e['script'], e['character']): e for e in existing_glyphs}
    pairs = {(e["script"], e["character"]) for e in existing_glyphs}
    notes = json.loads((ROOT / "scripts/data/matrix-glyph-notes.json").read_text(encoding="utf-8"))
    glyph_rejected = {}
    for script, characters in [("kai", common), ("seal", [chr(cp) for a, b in coverage["seal"] for cp in range(a, b + 1)])]:
        for character in characters:
            refresh = refresh_dictionary and existing_by_pair.get((script, character), {}).get('source', '').startswith('https://github.com/pwxcoo/chinese-xinhua/')
            if (script, character) in pairs and character not in notes and not refresh: continue
            row = dictionary.get(character)
            if not row and character not in notes:
                glyph_rejected[script + ":" + character] = "字典未收录"; continue
            try:
                reading, description = notes[character] if character in notes else (dictionary_readings(row), dictionary_note(row))
                record = glyph_normalize(dict(id=glyph_id(script, character), script=script, character=character,
                    reading=reading, description=description,
                    collection="常用汉字" if character in common else "篆字扩展",
                    source="矩阵回声编者简注（常用义）" if character in notes else f"https://github.com/pwxcoo/chinese-xinhua/blob/{DICTIONARY_REV}/data/word.json#字-{character}"), coverage)
            except ValueError as error:
                glyph_rejected[script + ":" + character] = str(error); continue
            target = folder / "content/glyphs" / (record["id"] + ".json")
            if character in notes or refresh:
                target.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            else:
                save(target, record)
            pairs.add((script, character))
    tibetan = [0xF40, 0xF41, 0xF42, 0xF44, 0xF45, 0xF46, 0xF47, 0xF49,
               0xF4F, 0xF50, 0xF51, 0xF53, 0xF54, 0xF55, 0xF56, 0xF58,
               0xF59, 0xF5A, 0xF5B, 0xF5D, 0xF5E, 0xF5F, 0xF60, 0xF61,
               0xF62, 0xF63, 0xF64, 0xF66, 0xF67, 0xF68]
    for script, points in [('yi', range(0xA000, 0xA48D)), ('tibetan', tibetan)]:
        for cp in points:
            character = chr(cp)
            if cp == 0xA015 or (script, character) in pairs: continue
            prefix = 'YI SYLLABLE ' if script == 'yi' else 'TIBETAN LETTER '
            name = unicodedata.name(character).removeprefix(prefix).lower()
            if script == 'tibetan' and name == '-a': name = '’a'
            record = glyph_normalize(dict(script=script, character=character, reading=name,
                description='规范彝文中的完整音节文字，用于记录彝语语音。这里列出 Unicode 标准音节名，单独的音节不对应固定的汉语词义。' if script == 'yi' else '藏文三十个基本字母之一，用于书写藏语。这里列出字母的拉丁转写名，字母本身不对应固定的汉语词义。',
                collection='彝文音节' if script == 'yi' else '藏文基本字母',
                source=f'Unicode {unicodedata.unidata_version} UnicodeData.txt，U+{cp:04X}；音节或字母名。'), coverage)
            save(folder / 'content/glyphs' / (record['id'] + '.json'), record); pairs.add((script, character))
    for name, base in [("chinese-poetry", POETRY), ("chinese-xinhua", DICTIONARY)]:
        target = folder / "content/licenses" / (name + "-MIT.txt"); target.parent.mkdir(exist_ok=True)
        target.write_text(download(cache, name + "-LICENSE.txt", base + "LICENSE", hashes), encoding="utf-8")
    report = dict(poems=len(imported), collections=dict(Counter(p.get("collection", "内置精选") for p in imported.values())),
                  commonHanzi=len(common), glyphs=len(pairs), glyphsByScript=dict(Counter(s for s, c in pairs)),
                  rejectedPoems=dict(rejected), pendingGlyphs=glyph_rejected, sources=dict(sorted(hashes.items())),
                  normalization="OpenCC 0.1.7 t2s; font-unsupported rare simplified characters keep their traditional counterparts; whitespace normalized; missing sentence-final punctuation supplied; no clipped poems")
    (folder / "content/import-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k not in ["sources", "pendingGlyphs"]}, ensure_ascii=False, indent=2))
    print("Pending glyphs:", json.dumps(glyph_rejected, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument('--refresh-dictionary', action='store_true', help='Rebuild dictionary-derived annotations; keep original and editor-authored notes')
    args = parser.parse_args()
    run(args.cache, args.refresh_dictionary)
