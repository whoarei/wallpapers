"""Read-only public audit of a GitHub wallpaper release and its Gitee mirror."""
import argparse
import concurrent.futures
import copy
import hashlib
import http.client
import json
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

GITHUB = "whoarei/wallpapers"
GITEE = "xishuaiya/wallpapers"
SOURCE_API = f"https://api.github.com/repos/{GITHUB}/releases"
MIRROR_API = f"https://gitee.com/api/v5/repos/{GITEE}/releases"
TAG = re.compile(r"library-v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\Z")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def fetch(url, *, keep=False):
    require(urllib.parse.urlsplit(url).scheme == "https", "Public audit requires HTTPS")
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "wallpaper-release-audit"})
            with urllib.request.urlopen(request, timeout=120) as response:
                checksum, size, parts = hashlib.sha256(), 0, []
                while chunk := response.read(1024 * 1024):
                    checksum.update(chunk)
                    size += len(chunk)
                    if keep:
                        require(size <= 8 * 1024 * 1024, "Release metadata exceeds 8 MiB")
                        parts.append(chunk)
            return checksum.hexdigest(), size, b"".join(parts)
        except urllib.error.HTTPError as error:
            if error.code not in (408, 425, 429, 500, 502, 503, 504) or attempt == 2:
                raise ValueError(f"Public download failed (HTTP {error.code})") from None
            delay = error.headers.get("Retry-After", "")
            time.sleep(int(delay) if delay.isdigit() else 2 ** (attempt + 1))
        except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException) as error:
            if attempt == 2:
                raise ValueError(f"Public download failed ({type(error).__name__})") from None
            time.sleep(2 ** (attempt + 1))


def read_bytes(url):
    return fetch(url, keep=True)[2]


def download(url):
    return fetch(url)[:2]


def checksums(data):
    result = {}
    for line in data.decode("utf-8").splitlines():
        match = re.fullmatch(r"([0-9a-f]{64})  ([A-Za-z0-9][A-Za-z0-9._-]*)", line)
        require(match is not None, "Malformed checksum entry")
        checksum, name = match.groups()
        require(name not in result and name != "SHA256SUMS.txt", "Duplicate or self-referencing checksum")
        result[name] = checksum
    require("catalog.json" in result, "Missing catalog checksum")
    return result


def stable(release, tag):
    require(release.get("tag_name") == tag, f"Unexpected release tag; expected {tag}")
    require(release.get("draft") is not True and release.get("prerelease") is False,
            f"Release is not published and stable: {tag}")


def assets(release):
    result = {}
    for asset in release["assets"]:
        name = asset["name"]
        require(name not in result, f"Duplicate attachment: {name}")
        result[name] = asset
    return result


def remote_refs(repository, tag):
    refs = ["refs/heads/main", f"refs/tags/{tag}", f"refs/tags/{tag}^{{}}"]
    output = subprocess.run(["git", "ls-remote", "--exit-code", repository, *refs],
                            check=True, capture_output=True, text=True, timeout=120).stdout
    result = {ref: sha for sha, ref in (line.split() for line in output.splitlines())}
    require(refs[0] in result and refs[1] in result, "Missing remote main or release tag")
    return result


def verify(tag, *, historical=False):
    require(TAG.fullmatch(tag) is not None, "Expected library-vX.Y.Z")
    source = json.loads(read_bytes(f"{SOURCE_API}/tags/{tag}"))
    mirror = json.loads(read_bytes(f"{MIRROR_API}/tags/{tag}"))
    stable(source, tag)
    stable(mirror, tag)
    source_assets, mirror_assets = assets(source), assets(mirror)
    require("SHA256SUMS.txt" in source_assets, "Missing source checksum file")
    source_sums = checksums(read_bytes(source_assets["SHA256SUMS.txt"]["browser_download_url"]))
    expected = {*source_sums, "SHA256SUMS.txt"}
    require(set(source_assets) == expected, "GitHub attachment set differs from checksum file")
    require(expected <= mirror_assets.keys(), f"Missing Gitee attachments: {sorted(expected - mirror_assets.keys())}")
    mirror_sums = checksums(read_bytes(mirror_assets["SHA256SUMS.txt"]["browser_download_url"]))
    require(source_sums.keys() == mirror_sums.keys(), "Gitee checksum file has missing or extra entries")

    catalogs = []
    for label, entries, sums in (("GitHub", source_assets, source_sums), ("Gitee", mirror_assets, mirror_sums)):
        data = read_bytes(entries["catalog.json"]["browser_download_url"])
        require(hashlib.sha256(data).hexdigest() == sums["catalog.json"], f"{label} catalog checksum mismatch")
        catalog = json.loads(data)
        require(catalog.get("schemaVersion") == 1 and "library-v" + catalog["version"] == tag,
                f"{label} catalog schema or version mismatch")
        catalogs.append(catalog)
    source_catalog, mirror_catalog = catalogs
    transformed = copy.deepcopy(source_catalog)
    source_base = f"https://github.com/{GITHUB}/releases/download/{tag}/"
    ids, zip_sizes, referenced = set(), {}, set()
    for wallpaper in transformed["wallpapers"]:
        require(wallpaper["id"] not in ids, "Duplicate wallpaper ID")
        ids.add(wallpaper["id"])
        for field in ("downloadUrl", "coverUrl"):
            if field not in wallpaper:
                continue
            url = wallpaper[field]
            name = url.removeprefix(source_base)
            require(url.startswith(source_base) and name in source_sums and name != "catalog.json",
                    "Unexpected catalog attachment URL")
            require(source_assets[name]["browser_download_url"] == url, "Source catalog URL differs from attachment")
            if field == "downloadUrl":
                require(name == f"{wallpaper['id']}-{wallpaper['version']}.zip", "ZIP filename/version mismatch")
                require(wallpaper["sha256"] == source_sums[name], f"ZIP checksum differs from catalog: {name}")
                zip_sizes[name] = wallpaper["size"]
            referenced.add(name)
            wallpaper[field] = mirror_assets[name]["browser_download_url"]
    require(referenced == set(source_sums) - {"catalog.json"}, "Unreferenced or missing catalog payload")
    require(transformed == mirror_catalog, "Catalogs differ beyond mirrored download and cover URLs")

    def verify_payload(name):
        require(source_sums[name] == mirror_sums[name], f"Payload checksum files disagree: {name}")
        source_hash, source_size = download(source_assets[name]["browser_download_url"])
        mirror_hash, mirror_size = download(mirror_assets[name]["browser_download_url"])
        require(source_hash == mirror_hash == source_sums[name], f"Downloaded payload checksum mismatch: {name}")
        require(source_size == mirror_size == source_assets[name]["size"], f"Downloaded payload size mismatch: {name}")
        if name in zip_sizes:
            require(source_size == zip_sizes[name], f"ZIP size differs from catalog: {name}")
        return name

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        verified = list(pool.map(verify_payload, sorted(referenced)))
    source_refs = remote_refs(f"https://github.com/{GITHUB}.git", tag)
    mirror_refs = remote_refs(f"https://gitee.com/{GITEE}.git", tag)
    require(source_refs == mirror_refs, "GitHub and Gitee main/tag refs differ")

    if not historical:
        for api, entries in ((SOURCE_API, source_assets), (MIRROR_API, mirror_assets)):
            latest = json.loads(read_bytes(api + "/latest"))
            stable(latest, tag)
            latest_assets = assets(latest)
            require(latest_assets["catalog.json"]["browser_download_url"] == entries["catalog.json"]["browser_download_url"],
                    "Latest API points to a different catalog attachment")
            data = read_bytes(latest_assets["catalog.json"]["browser_download_url"])
            expected_hash = source_sums["catalog.json"] if api == SOURCE_API else mirror_sums["catalog.json"]
            require(hashlib.sha256(data).hexdigest() == expected_hash, "Latest catalog checksum mismatch")
        stable_catalog = read_bytes(f"https://github.com/{GITHUB}/releases/latest/download/catalog.json")
        require(hashlib.sha256(stable_catalog).hexdigest() == source_sums["catalog.json"], "GitHub stable catalog entry is stale")

    return {"tag": tag, "verified": True, "release_assets": len(expected),
            "verified_payloads_per_host": len(verified), "wallpapers": len(ids),
            "latest_checked": not historical, "main_commit": source_refs["refs/heads/main"],
            "github_release": f"https://github.com/{GITHUB}/releases/tag/{tag}",
            "gitee_release": f"https://gitee.com/{GITEE}/releases/tag/{tag}"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tag", help="Published library-vX.Y.Z tag")
    parser.add_argument("--historical", action="store_true", help="Do not require this release to be latest")
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.tag, historical=args.historical), ensure_ascii=False, indent=2))
    except (ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
        raise SystemExit(f"Release audit failed: {error}") from None
