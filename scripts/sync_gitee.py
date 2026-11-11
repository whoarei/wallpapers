"""Mirror verified GitHub Release assets to Gitee; Python standard library only."""
import argparse
import hashlib
import json
import os
import re
import secrets
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPOSITORY = "xishuaiya/wallpapers"
API = f"https://gitee.com/api/v5/repos/{REPOSITORY}"
TAG = re.compile(r"library-v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\Z")


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def download_digest(url):
    if urllib.parse.urlsplit(url).scheme != "https":
        raise ValueError("Gitee attachment download URL must use HTTPS")
    # Public attachment downloads need no token, including across CDN redirects.
    with urllib.request.urlopen(url, timeout=120) as stream:
        result = hashlib.sha256()
        while chunk := stream.read(1024 * 1024):
            result.update(chunk)
    return result.hexdigest()


class Gitee:
    def __init__(self, token):
        if not token:
            raise ValueError("Missing GITEE_TOKEN")
        self.token = token

    def request(self, method, path, payload=None, file=None):
        headers = {"Accept": "application/json"}
        data = None
        if file is not None:
            boundary = secrets.token_hex(24)
            headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
            data = (
                f'--{boundary}\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n'
                f'{self.token}\r\n--{boundary}\r\n'
                f'Content-Disposition: form-data; name="file"; filename="{file.name}"\r\n'
                'Content-Type: application/octet-stream\r\n\r\n'
            ).encode() + file.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
        elif payload is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps({**payload, "access_token": self.token}).encode()
        else:
            separator = "&" if "?" in path else "?"
            path += separator + urllib.parse.urlencode({"access_token": self.token})
        request = urllib.request.Request(API + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                body = response.read()
                return json.loads(body) if body else None
        except urllib.error.HTTPError as error:
            if method == "GET" and error.code == 404:
                return None
            detail = error.read().decode(errors="replace").replace(self.token, "[redacted]")
            raise RuntimeError(f"Gitee {method} failed (HTTP {error.code}): {detail}") from None
        except urllib.error.URLError:
            # Do not include request URLs, which may contain the access token.
            raise RuntimeError(f"Gitee {method} connection failed") from None

    def attachments(self, release_id):
        files = {}
        page = 1
        while True:
            batch = self.request("GET", f"/releases/{release_id}/attach_files?per_page=100&page={page}")
            if not isinstance(batch, list):
                raise RuntimeError("Could not list Gitee Release attachments")
            for item in batch:
                if item["name"] in files:
                    raise ValueError(f"Duplicate Gitee attachment: {item['name']}")
                files[item["name"]] = item
            if len(batch) < 100:
                return files
            page += 1

    def ensure_attachment(self, release_id, path, existing):
        attachment = existing.get(path.name)
        if attachment is None:
            attachment = self.request("POST", f"/releases/{release_id}/attach_files", file=path)
            existing[path.name] = attachment
            print(f"Uploaded {path.name}")
        else:
            print(f"Verifying existing {path.name}")
        url = attachment["browser_download_url"]
        if download_digest(url) != digest(path):
            raise ValueError(f"Gitee attachment differs: {path.name}; refusing to overwrite published content")
        return url


def verify_assets(folder):
    expected = {}
    for line in (folder / "SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
        match = re.fullmatch(r"([0-9a-f]{64})  ([A-Za-z0-9][A-Za-z0-9._-]*)", line)
        if not match or match[2] in expected or match[2] == "SHA256SUMS.txt":
            raise ValueError("Invalid or duplicate SHA256SUMS.txt entry")
        expected[match[2]] = match[1]
    actual = {path.name for path in folder.iterdir()}
    if actual != {*expected, "SHA256SUMS.txt"} or "catalog.json" not in expected:
        raise ValueError("Release files do not match SHA256SUMS.txt")
    for name, checksum in expected.items():
        path = folder / name
        if path.is_symlink() or not path.is_file() or digest(path) != checksum:
            raise ValueError(f"Release checksum mismatch: {name}")
    return sorted(expected)


def rewrite_catalog(catalog, urls, source_base):
    for wallpaper in catalog["wallpapers"]:
        for field in ("downloadUrl", "coverUrl"):
            if field not in wallpaper:
                continue
            source_url = wallpaper[field]
            name = source_url.removeprefix(source_base)
            if not source_url.startswith(source_base) or name not in urls:
                raise ValueError(f"Catalog references an unexpected asset: {source_url}")
            wallpaper[field] = urls[name]


def sync(folder, release, source_repository, target_commit, client):
    tag = release["tagName"]
    if not TAG.fullmatch(tag) or release["isDraft"] or release["isPrerelease"]:
        raise ValueError("Only published library-vX.Y.Z stable releases can be synced")
    names = verify_assets(folder)
    catalog_path = folder / "catalog.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    if "library-v" + catalog["version"] != tag:
        raise ValueError("Catalog version does not match the release tag")
    source_base = f"https://github.com/{source_repository}/releases/download/{tag}/"
    payload_names = [name for name in names if name != "catalog.json"]
    # Check every catalog reference before creating a remote Release or attachment.
    rewrite_catalog(json.loads(json.dumps(catalog)), {name: name for name in payload_names}, source_base)
    target = client.request("GET", "/releases/tags/" + urllib.parse.quote(tag, safe=""))
    if target is None:
        target = client.request("POST", "/releases", payload={
            "tag_name": tag,
            "target_commitish": target_commit,
            "name": release["name"] or tag,
            "body": (release["body"] or "") + f"\n\n同步自 GitHub：{release['url']}",
            "prerelease": False,
        })
    release_id = target["id"]
    existing = client.attachments(release_id)
    urls = {}
    for name in payload_names:
        urls[name] = client.ensure_attachment(release_id, folder / name, existing)
    rewrite_catalog(catalog, urls, source_base)
    # Keep the downloaded GitHub assets intact so a retry always starts with the
    # original checksums. Only the Gitee catalog and its checksum file differ.
    with tempfile.TemporaryDirectory(prefix="gitee-release-") as temp:
        mirror = Path(temp)
        mirror_catalog = mirror / "catalog.json"
        mirror_catalog.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        client.ensure_attachment(release_id, mirror_catalog, existing)
        checksums = [
            f"{digest(mirror_catalog if name == 'catalog.json' else folder / name)}  {name}\n"
            for name in names
        ]
        mirror_sums = mirror / "SHA256SUMS.txt"
        mirror_sums.write_text("".join(checksums), encoding="utf-8")
        client.ensure_attachment(release_id, mirror_sums, existing)
    print(f"Verified Gitee Release: https://gitee.com/{REPOSITORY}/releases/tag/{tag}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, required=True)
    parser.add_argument("--release", type=Path, required=True)
    parser.add_argument("--source-repository", required=True)
    parser.add_argument("--target-commit", required=True)
    args = parser.parse_args()
    try:
        sync(args.assets, json.loads(args.release.read_text(encoding="utf-8")),
             args.source_repository, args.target_commit, Gitee(os.environ.get("GITEE_TOKEN")))
    except (ValueError, RuntimeError, urllib.error.URLError) as error:
        raise SystemExit(str(error)) from None
