"""Build deterministic wallpaper packages and an HTTPS catalog; stdlib only."""
import argparse
import hashlib
import json
import re
import shutil
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent.parent
SLUG = re.compile(r"[a-z0-9][a-z0-9-]{0,63}\Z")
VERSION = re.compile(r"\d+\.\d+\.\d+\Z")
RESERVED = {"con", "prn", "aux", "nul", *(f"com{i}" for i in range(1, 10)), *(f"lpt{i}" for i in range(1, 10))}


def safe_path(name):
    parts = PurePosixPath(name).parts
    return bool(parts) and not name.startswith("/") and "\\" not in name and all(
        part not in (".", "..") and not any(c in part for c in ':<>"|?*\0')
        and not part.endswith((".", " ")) and part.split(".")[0].lower() not in RESERVED
        for part in parts
    )


def build(previous=None):
    library = json.loads((ROOT / "library.json").read_text(encoding="utf-8"))
    if library.get("schemaVersion") != 1 or not VERSION.fullmatch(library["version"]):
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
        if not folder.is_dir() or folder.is_symlink() or not SLUG.fullmatch(folder.name):
            raise ValueError(f"Invalid wallpaper directory: {folder.name}")
        metadata = json.loads((folder / "module.json").read_text(encoding="utf-8"))
        if not metadata.get("enabled", True):
            continue
        version = metadata["version"]
        if metadata.get("id") != folder.name or not VERSION.fullmatch(version):
            raise ValueError(f"Invalid ID/version: {folder.name}")
        entry = metadata.get("entry", "index.html")
        if not safe_path(entry) or not entry.endswith(".html") or not (folder / entry).is_file():
            raise ValueError(f"Invalid entry: {folder.name}")
        if metadata.get("type", "web") != "web" or metadata.get("schemaVersion", 1) != 1:
            raise ValueError("Only schema 1 web wallpapers are supported")
        archive_name = f"{folder.name}-{version}.zip"
        archive_path = output / archive_name
        files = sorted(p for p in folder.rglob("*") if p.is_file())
        names = set()
        total = 0
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_STORED) as archive:
            for source in files:
                relative = source.relative_to(folder).as_posix()
                if source.is_symlink() or not safe_path(relative) or relative.casefold() in names:
                    raise ValueError(f"Unsafe or duplicate package file: {relative}")
                names.add(relative.casefold())
                data = source.read_bytes()
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
        cover = metadata.get("cover", "cover.jpg")
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
