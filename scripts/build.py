"""Build deterministic wallpaper packages and an HTTPS catalog; stdlib only."""
import argparse
import hashlib
import json
import re
import shutil
import zipfile
from pathlib import Path
from matrix_poetry import collect as collect_matrix_poetry
from matrix_glyphs import collect as collect_matrix_glyphs
from matrix_settings import collect as collect_matrix_settings

ROOT = Path(__file__).resolve().parent.parent
SLUG = re.compile(r"[a-z0-9][a-z0-9-]{0,63}\Z")
VERSION = re.compile(r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\Z")
RESERVED = {"con", "prn", "aux", "nul", *(f"com{i}" for i in range(1, 10)), *(f"lpt{i}" for i in range(1, 10))}


def safe_path(name):
    if not isinstance(name, str):
        return False
    parts = name.split("/")
    return bool(name) and not name.startswith("/") and "\\" not in name and all(
        part not in ("", ".", "..") and not any(c in part for c in ':<>"|?*%\0')
        and not any(ord(c) < 32 or 127 <= ord(c) <= 159 for c in part)
        and not part.endswith((".", " ")) and part.split(".")[0].lower() not in RESERVED
        for part in parts
    )


def validate_metadata(metadata, wallpaper_id):
    if not isinstance(metadata, dict):
        raise ValueError(f"module.json must be an object: {wallpaper_id}")
    if metadata.get("id") != wallpaper_id:
        raise ValueError(f"Module ID differs from directory: {wallpaper_id}")
    if not isinstance(metadata.get("version"), str) or not VERSION.fullmatch(metadata["version"]):
        raise ValueError(f"Invalid wallpaper version: {wallpaper_id}")
    if type(metadata.get("schemaVersion", 1)) is not int or metadata.get("schemaVersion", 1) != 1 or metadata.get("type", "web") != "web":
        raise ValueError("Only schema 1 web wallpapers are supported")
    for field, limit in (("name", 80), ("subtitle", 80), ("description", 300)):
        value = metadata.get(field, "")
        if not isinstance(value, str) or len(value) > limit or (field == "name" and not value.strip()):
            raise ValueError(f"Invalid {field}: {wallpaper_id}")
    minimum = metadata.get("minAppVersion", "0.2.0")
    if not isinstance(minimum, str) or not VERSION.fullmatch(minimum):
        raise ValueError(f"Invalid minimum app version: {wallpaper_id}")
    tags = metadata.get("tags", [])
    if not isinstance(tags, list) or len(tags) > 8 or any(not isinstance(tag, str) or len(tag) > 30 for tag in tags):
        raise ValueError(f"Invalid wallpaper tags: {wallpaper_id}")
    order = metadata.get("order", 100)
    if type(order) is not int or not -(1 << 63) <= order < (1 << 63) or type(metadata.get("enabled", True)) is not bool:
        raise ValueError(f"Invalid order/enabled field: {wallpaper_id}")
    if "settings" in metadata:
        settings = metadata["settings"]
        entry = settings.get("entry") if isinstance(settings, dict) else None
        if not isinstance(entry, str) or not safe_path(entry) or not entry.endswith(".html") or entry == metadata.get("entry", "index.html"):
            raise ValueError(f"Invalid settings.entry: {wallpaper_id}")


def build(previous=None):
    library = json.loads((ROOT / "library.json").read_text(encoding="utf-8"))
    if type(library.get("schemaVersion")) is not int or library.get("schemaVersion") != 1 or not isinstance(library.get("version"), str) or not VERSION.fullmatch(library["version"]):
        raise ValueError("Invalid library version/schema")
    repository = library["repository"]
    if repository != "whoarei/wallpapers":
        raise ValueError("Unexpected official repository")
    tag = "library-v" + library["version"]
    base = f"https://github.com/{repository}/releases/download/{tag}/"
    output = ROOT / "dist"
    if output.is_symlink():
        raise ValueError("Output cannot be a symlink")
    output.mkdir(exist_ok=True)
    for old_file in output.iterdir():
        if not old_file.is_file() or old_file.is_symlink():
            raise ValueError("Unexpected output entry")
        old_file.unlink()
    catalog = {"schemaVersion": 1, "version": library["version"], "wallpapers": []}
    for folder in sorted((ROOT / "wallpapers").iterdir()):
        if not folder.is_dir() or folder.is_symlink() or not SLUG.fullmatch(folder.name) or folder.name.lower() in RESERVED:
            raise ValueError(f"Invalid wallpaper directory: {folder.name}")
        metadata = json.loads((folder / "module.json").read_text(encoding="utf-8"))
        validate_metadata(metadata, folder.name)
        if not metadata.get("enabled", True):
            continue
        version = metadata["version"]
        if metadata.get("id") != folder.name or not VERSION.fullmatch(version):
            raise ValueError(f"Invalid ID/version: {folder.name}")
        entry = metadata.get("entry", "index.html")
        if not safe_path(entry) or not entry.endswith(".html") or not (folder / entry).is_file():
            raise ValueError(f"Invalid entry: {folder.name}")
        if "settings" in metadata and not (folder / metadata["settings"]["entry"]).is_file():
            raise ValueError(f"Missing settings.entry: {folder.name}")
        if metadata.get("type", "web") != "web" or metadata.get("schemaVersion", 1) != 1:
            raise ValueError("Only schema 1 web wallpapers are supported")
        archive_name = f"{folder.name}-{version}.zip"
        archive_path = output / archive_name
        files = sorted(p for p in folder.rglob("*") if p.is_file())
        names = set()
        total = 0
        generated_poems = collect_matrix_poetry(folder) if folder.name == "matrix-echo" else None
        if generated_poems is not None and not (folder / "poems.generated.js").is_file():
            raise ValueError("Missing matrix-echo/poems.generated.js; run scripts/sync_matrix_poetry.py")
        generated_glyphs = collect_matrix_glyphs(folder) if folder.name == "matrix-echo" and (folder / "glyphs.js").is_file() else None
        if generated_glyphs is not None and not (folder / "glyphs.generated.js").is_file():
            raise ValueError("Missing matrix-echo/glyphs.generated.js; run scripts/sync_matrix_glyphs.py")
        generated_settings = collect_matrix_settings(folder) if folder.name == "matrix-echo" and (folder / "settings.template.html").is_file() else None
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_STORED) as archive:
            for source in files:
                relative = source.relative_to(folder).as_posix()
                if source.is_symlink() or not safe_path(relative) or relative.casefold() in names:
                    raise ValueError(f"Unsafe or duplicate package file: {relative}")
                names.add(relative.casefold())
                data = source.read_bytes()
                if generated_poems is not None and relative == "poems.generated.js":
                    data = generated_poems
                if generated_glyphs is not None and relative == "glyphs.generated.js":
                    data = generated_glyphs
                if generated_settings is not None and relative == "settings.html":
                    data = generated_settings
                # Match the repository's LF policy on Windows working trees too;
                # identical source text must produce identical release ZIPs.
                if source.suffix.lower() in {".html", ".css", ".js", ".mjs", ".cjs", ".json", ".svg", ".md", ".txt", ".glsl", ".wgsl", ".vert", ".frag"}:
                    data = data.replace(b"\r\n", b"\n")
                total += len(data)
                if total > 512 * 1024 * 1024 or len(names) > 4096:
                    raise ValueError("Wallpaper exceeds package limits")
                info = zipfile.ZipInfo(relative, date_time=(1980, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                archive.writestr(info, data)
        package = archive_path.read_bytes()
        if len(package) > 128 * 1024 * 1024:
            raise ValueError("Compressed package exceeds download limit")
        item = {key: metadata.get(key, "") for key in ("name", "subtitle", "description")}
        item.update(id=folder.name, version=version, entry=entry,
                    minAppVersion=metadata.get("minAppVersion", "0.2.0"),
                    tags=metadata.get("tags", []), downloadUrl=base + archive_name,
                    sha256=hashlib.sha256(package).hexdigest(), size=len(package),
                    unpackedSize=total)
        cover = metadata.get("cover") or "cover.jpg"
        if safe_path(cover) and (folder / cover).is_file():
            cover_name = f"{folder.name}-{version}-cover{Path(cover).suffix}"
            shutil.copyfile(folder / cover, output / cover_name)
            item["coverUrl"] = base + cover_name
        catalog["wallpapers"].append(item)
    if previous:
        old = {item["id"]: item for item in json.loads(Path(previous).read_text(encoding="utf-8"))["wallpapers"]}
        for item in catalog["wallpapers"]:
            prior = old.get(item["id"])
            if prior and tuple(map(int, item["version"].split("."))) < tuple(map(int, prior["version"].split("."))):
                raise ValueError(f"Wallpaper version regressed: {item['id']}")
            if prior and prior["version"] == item["version"] and prior["sha256"] != item["sha256"]:
                raise ValueError(f"Bump wallpaper version after changing files: {item['id']}")
    (output / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    checksums = [hashlib.sha256(p.read_bytes()).hexdigest() + "  " + p.name for p in sorted(output.iterdir()) if p.is_file() and p.name != "SHA256SUMS.txt"]
    (output / "SHA256SUMS.txt").write_text("\n".join(checksums) + "\n", encoding="utf-8")
    print(f"Built {len(catalog['wallpapers'])} wallpapers for {tag}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--previous")
    build(parser.parse_args().previous)
