"""Collect expandable floating glyphs and actual offline WOFF font coverage."""
import json
import re
import struct
import zlib

from matrix_poetry import field

FONTS = {"seal": "Seal.woff", "kai": "WenKai.woff", "yi": "Yi.woff", "tibetan": "Tibetan.woff"}
HAN = ((0x3400, 0x4DBF), (0x4E00, 0x9FFF), (0xF900, 0xFAFF), (0x20000, 0x323AF))


def valid_character(script, char):
    if not isinstance(char, str) or len(char) != 1:
        return False
    cp = ord(char)
    return (script in ("seal", "kai") and any(a <= cp <= b for a, b in HAN)
            or script == "yi" and 0xA000 <= cp <= 0xA48C
            or script == "tibetan" and 0x0F40 <= cp <= 0x0F6C)


def identity(script, character):
    return f"glyph-{script}-{ord(character):x}"


def woff_codepoints(path):
    """Read Unicode cmap formats 4/12/13 using only the standard library."""
    data = path.read_bytes()
    try:
        if data[:4] != b"wOFF":
            raise ValueError("expected WOFF 1 font")
        cmap = None
        for i in range(struct.unpack_from(">H", data, 12)[0]):
            tag, offset, compressed, length, _ = struct.unpack_from(">4sIIII", data, 44 + i * 20)
            if tag == b"cmap":
                cmap = data[offset:offset + compressed]
                if compressed < length:
                    cmap = zlib.decompress(cmap)
                if len(cmap) != length:
                    raise ValueError("invalid cmap length")
                break
        if cmap is None:
            raise ValueError("missing Unicode cmap")
        result = set()
        for i in range(struct.unpack_from(">H", cmap, 2)[0]):
            platform, encoding, start = struct.unpack_from(">HHI", cmap, 4 + i * 8)
            if platform != 0 and not (platform == 3 and encoding in (1, 10)):
                continue
            fmt = struct.unpack_from(">H", cmap, start)[0]
            if fmt in (12, 13):
                groups = struct.unpack_from(">I", cmap, start + 12)[0]
                for group in range(groups):
                    first, last, glyph = struct.unpack_from(">III", cmap, start + 16 + group * 12)
                    if last > 0x10FFFF or first > last:
                        raise ValueError("invalid Unicode cmap range")
                    if fmt == 12:
                        result.update(range(first + (glyph == 0), last + 1))
                    elif glyph:
                        result.update(range(first, last + 1))
            elif fmt == 4:
                count = struct.unpack_from(">H", cmap, start + 6)[0] // 2
                for segment in range(count):
                    last = struct.unpack_from(">H", cmap, start + 14 + segment * 2)[0]
                    first = struct.unpack_from(">H", cmap, start + 16 + count * 2 + segment * 2)[0]
                    delta = struct.unpack_from(">h", cmap, start + 16 + count * 4 + segment * 2)[0]
                    pointer = start + 16 + count * 6 + segment * 2
                    offset = struct.unpack_from(">H", cmap, pointer)[0]
                    for cp in range(first, min(last, 0xFFFE) + 1):
                        glyph = struct.unpack_from(">H", cmap, pointer + offset + (cp - first) * 2)[0] if offset else cp
                        if (glyph or not offset) and (glyph + delta) & 0xFFFF:
                            result.add(cp)
        if not result:
            raise ValueError("missing supported Unicode cmap")
        return result
    except (struct.error, zlib.error) as error:
        raise ValueError(f"{path.name}: invalid WOFF cmap") from error


def font_coverage(folder):
    coverage = {}
    for script, filename in FONTS.items():
        points = sorted(cp for cp in woff_codepoints(folder / "fonts" / filename)
                        if valid_character(script, chr(cp)))
        ranges = []
        for cp in points:
            if ranges and ranges[-1][1] + 1 == cp:
                ranges[-1][1] = cp
            else:
                ranges.append([cp, cp])
        coverage[script] = ranges
    return coverage


def normalize(value, coverage):
    if not isinstance(value, dict):
        raise ValueError("expected one glyph object per file")
    script, character = value.get("script"), value.get("character")
    if not isinstance(script, str) or script not in FONTS or not valid_character(script, character):
        raise ValueError("script/character: expected a Han character, Yi syllable or Tibetan base letter of the selected script")
    if not any(a <= ord(character) <= b for a, b in coverage[script]):
        raise ValueError(f"character: {character} is not covered by {FONTS[script]}")
    glyph_id = value.get("id", identity(script, character))
    if not isinstance(glyph_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", glyph_id):
        raise ValueError("id: expected 1–64 lowercase letters, digits or hyphens")
    reading = field(value.get("reading", ""), "reading", 80, True)
    description = value.get("description")
    if isinstance(description, str):
        description = description.replace("\r\n", "\n").strip()
    if (not isinstance(description, str) or not description or len(description) > 600
            or any((ord(c) < 32 and c != "\n") or 127 <= ord(c) <= 159 for c in description)):
        raise ValueError("description: expected 1–600 characters of text")
    if "enabled" in value and type(value["enabled"]) is not bool:
        raise ValueError("enabled: expected boolean")
    return dict(id=glyph_id, script=script, character=character, reading=reading,
                description=description, enabled=value.get("enabled", True))


def collect(folder):
    coverage = font_coverage(folder)
    entries, ids, characters, filenames = [], set(), set(), {}
    files = sorted((folder / "content" / "glyphs").glob("*.json"))
    if not 1 <= len(files) <= 500:
        raise ValueError("matrix-echo/content/glyphs: expected 1–500 JSON files")
    total = 0
    for source in files:
        try:
            if source.is_symlink():
                raise ValueError("expected a regular JSON file")
            total += source.stat().st_size
            if total > 2 * 1024 * 1024:
                raise ValueError("expected regular JSON files, total at most 2 MiB")
            entry = normalize(json.loads(source.read_text(encoding="utf-8-sig")), coverage)
            pair = (entry["script"], entry["character"])
            if entry["id"] in ids or pair in characters:
                raise ValueError("duplicate glyph id or script/character")
            ids.add(entry["id"]); characters.add(pair); entries.append(entry)
            filenames[entry["id"]] = source.name
        except (ValueError, UnicodeError) as error:
            raise ValueError(f"{source.relative_to(folder)}: {error}") from error
    def payload(value):
        return json.dumps(value, ensure_ascii=False, indent=2).replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    return ("// Generated by scripts/sync_matrix_glyphs.py; edit content/glyphs/*.json.\n"
            + "window.MATRIX_GLYPHS = " + payload(entries) + ";\n"
            + "window.MATRIX_GLYPH_FILES = " + json.dumps(filenames, ensure_ascii=True, sort_keys=True) + ";\n"
            + "window.MATRIX_GLYPH_COVERAGE = " + payload(coverage) + ";\n").encode("utf-8")
