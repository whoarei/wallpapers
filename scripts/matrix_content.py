"""Shared limits, provenance validation and deterministic offline data shards."""
import json

MAX_POEMS = 100000
MAX_GLYPHS = 20000
MAX_IMPORT_BYTES = 32 * 1024 * 1024
MAX_VERSES = 1024
SHARD_SIZE = 256


def sync(folder, files, kind, check=False):
    expected = set(files)
    stale = [p for p in (folder / "data").glob(f"{kind}-*.js")
             if p.relative_to(folder).as_posix() not in expected]
    if check:
        if stale or any(not (folder / name).is_file() or (folder / name).read_bytes() != data
                        for name, data in files.items()):
            raise SystemExit(f"Preview {kind} are stale; run the matching sync_matrix script")
        return
    for name, data in files.items():
        target = folder / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    for path in stale:
        path.unlink()


def metadata(value):
    from matrix_poetry import field
    result = {}
    for name, maximum in (("collection", 60), ("source", 400)):
        if name in value:
            result[name] = field(value[name], name, maximum, True)
    if "tags" in value:
        tags = value["tags"]
        if not isinstance(tags, list) or len(tags) > 12:
            raise ValueError("tags: expected at most 12 labels")
        result["tags"] = list(dict.fromkeys(field(tag, "tags", 30) for tag in tags))
    return result


def payload(value, pretty=False):
    return json.dumps(value, ensure_ascii=False, indent=2 if pretty else None,
                      separators=None if pretty else (",", ":")).replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def artifacts(kind, entries, filenames, extra=""):
    plural, constant = ("poems", "POEM") if kind == "poems" else ("glyphs", "GLYPH")
    array = "MATRIX_POEMS" if kind == "poems" else "MATRIX_GLYPHS"
    header = f"// Generated; edit content/{plural}/*.json, then run scripts/sync_matrix_{'poetry' if kind == 'poems' else 'glyphs'}.py.\n"
    # Small third-party/legacy bundles remain self-contained and work without a loader.
    files = {}
    if len(entries) <= SHARD_SIZE:
        body = f"window.{array} = {payload(entries, True)};\n"
    else:
        names = []
        for start in range(0, len(entries), SHARD_SIZE):
            name = f"data/{plural}-{start // SHARD_SIZE:04d}.js"
            names.append(name)
            files[name] = ("(window.MATRIX_DATA_PARTS ||= Object.create(null))[" + payload(name)
                           + "] = " + payload(entries[start:start + SHARD_SIZE]) + ";\n").encode("utf-8")
        body = f"window.{array} = [];\nwindow.MATRIX_{constant}_CHUNKS = {payload(names)};\n"
    body += f"window.MATRIX_{constant}_FILES = {payload(filenames, True)};\n" + extra
    files[f"{plural}.generated.js"] = (header + body).encode("utf-8")
    return files
