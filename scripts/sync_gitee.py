"""Mirror verified GitHub Release assets to Gitee; Python standard library + curl."""
import argparse
import hashlib
import json
import os
import re
import subprocess
import tempfile
import time
import http.client
from email.utils import parsedate_to_datetime
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPOSITORY = "xishuaiya/wallpapers"
API = f"https://gitee.com/api/v5/repos/{REPOSITORY}"
TAG = re.compile(r"library-v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\Z")
ATTEMPTS = 3


class GiteeError(RuntimeError):
    def __init__(self, message, *, retryable=False, retry_after=None):
        super().__init__(message)
        self.retryable = retryable
        self.retry_after = retry_after


def retry_after(value):
    if not value:
        return None
    try:
        return max(0, int(value))
    except ValueError:
        try:
            return max(0, parsedate_to_datetime(value).timestamp() - time.time())
        except (ValueError, TypeError, OverflowError):
            return None


def wait_retry(error, attempt, label):
    delay = error.retry_after if error.retry_after is not None else 2 ** attempt
    print(f"{label}: retry {attempt + 1}/{ATTEMPTS} in {delay:g}s ({error})", flush=True)
    time.sleep(delay)


def transport_error(method, error):
    # Exception URLs can include credentials; retain only safe diagnostic codes.
    reason = getattr(error, "reason", error)
    kind = type(reason).__name__
    code = getattr(reason, "errno", None)
    suffix = f", errno={code}" if isinstance(code, int) else ""
    return GiteeError(f"Gitee {method} connection failed ({kind}{suffix})", retryable=True)


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def download_digest(url):
    if urllib.parse.urlsplit(url).scheme != "https":
        raise ValueError("Gitee attachment download URL must use HTTPS")
    # Public attachment downloads need no token, including across CDN redirects.
    for attempt in range(1, ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(url, timeout=120) as stream:
                result = hashlib.sha256()
                while chunk := stream.read(1024 * 1024):
                    result.update(chunk)
            return result.hexdigest()
        except urllib.error.HTTPError as error:
            failure = GiteeError(f"Gitee public download failed (HTTP {error.code})",
                                 retryable=error.code in (408, 425, 429, 500, 502, 503, 504),
                                 retry_after=retry_after(error.headers.get("Retry-After")))
        except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException) as error:
            failure = transport_error("download", error)
        if not failure.retryable or attempt == ATTEMPTS:
            raise failure from None
        wait_retry(failure, attempt, "Public attachment verification")


class Gitee:
    def __init__(self, token):
        if not token:
            raise ValueError("Missing GITEE_TOKEN")
        self.token = token

    def redact(self, value):
        for secret in (self.token, urllib.parse.quote(self.token, safe=""), urllib.parse.quote_plus(self.token)):
            value = value.replace(secret, "[redacted]")
        return value

    def http_error(self, method, status, body, headers):
        detail = self.redact(body.decode(errors="replace"))[:1000]
        return GiteeError(f"Gitee {method} failed (HTTP {status}): {detail}",
                          retryable=status in (408, 409, 425, 429, 500, 502, 503, 504),
                          retry_after=retry_after(headers.get("retry-after")))

    def upload(self, path, file):
        """Stream multipart with curl; keep the token exclusively on hidden stdin.

        A single Python sendall of a multi-MiB multipart body repeatedly stalled
        on this route. curl provides bounded transfer time and transport codes.
        Do not enable curl's blind POST retries: ensure_attachment reconciles
        the remote filename and hash before retrying an ambiguous upload.
        """
        def quoted(value):
            return '"' + value.replace('\\', '\\\\').replace('"', '\\"').replace('\r', '\\r').replace('\n', '\\n') + '"'

        fields = {
            "url": API + path,
            "request": "POST",
            "header": "Accept: application/json",
            "connect-timeout": "30",
            "max-time": "300",
            "expect100-timeout": "5",
            "write-out": "\n__gitee_status__:%{http_code}",
        }
        config = "\n".join(f"{key} = {quoted(value)}" for key, value in fields.items())
        config += "\nhttp1.1\nsilent\nshow-error\ninclude\n"
        config += "form-string = " + quoted("access_token=" + self.token) + "\n"
        config += "form = " + quoted('file=@"' + str(file.resolve()).replace('"', '\\"') + '";type=application/octet-stream') + "\n"
        try:
            result = subprocess.run(["curl", "--config", "-"], input=config.encode(),
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=315, check=False)
        except FileNotFoundError:
            raise GiteeError("Gitee attachment upload requires curl on PATH") from None
        except subprocess.TimeoutExpired:
            raise GiteeError("Gitee POST transfer timed out", retryable=True) from None
        response, marker, status_text = result.stdout.rpartition(b"\n__gitee_status__:")
        status = int(status_text) if marker and status_text.strip().isdigit() else 0
        if result.returncode:
            detail = self.redact(result.stderr.decode(errors="replace"))[:600]
            raise GiteeError(f"Gitee POST transport failed (curl {result.returncode}): {detail}",
                              retryable=result.returncode in (5, 6, 7, 16, 18, 28, 35, 52, 55, 56, 92))
        headers = {}
        while response.startswith(b"HTTP/"):
            header_block, separator, body = response.partition(b"\r\n\r\n")
            if not separator:
                break
            headers = {}
            for line in header_block.decode(errors="replace").splitlines()[1:]:
                key, separator, value = line.partition(":")
                if separator:
                    headers[key.lower()] = value.strip()
            response = body
        if not 200 <= status < 300:
            raise self.http_error("POST", status, response, headers)
        try:
            return json.loads(response)
        except (ValueError, UnicodeDecodeError):
            raise GiteeError("Gitee POST returned an invalid JSON response", retryable=True) from None

    def request(self, method, path, payload=None, file=None):
        if file is not None:
            return self.upload(path, file)
        headers = {"Accept": "application/json"}
        data = None
        if payload is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps({**payload, "access_token": self.token}).encode()
        else:
            separator = "&" if "?" in path else "?"
            path += separator + urllib.parse.urlencode({"access_token": self.token})
        request = urllib.request.Request(API + path, data=data, headers=headers, method=method)
        for attempt in range(1, ATTEMPTS + 1):
            try:
                with urllib.request.urlopen(request, timeout=120) as response:
                    body = response.read()
                    return json.loads(body) if body else None
            except urllib.error.HTTPError as error:
                if method == "GET" and error.code == 404:
                    return None
                failure = self.http_error(method, error.code, error.read(),
                                          {key.lower(): value for key, value in error.headers.items()})
            except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException) as error:
                failure = transport_error(method, error)
            if method not in ("GET", "PATCH") or not failure.retryable or attempt == ATTEMPTS:
                raise failure from None
            wait_retry(failure, attempt, f"Gitee {method}")

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
        for attempt in range(1, ATTEMPTS + 1):
            if attachment is not None:
                print(f"Verifying existing {path.name}", flush=True)
                break
            try:
                print(f"Uploading {path.name} ({path.stat().st_size} bytes), attempt {attempt}/{ATTEMPTS}", flush=True)
                attachment = self.request("POST", f"/releases/{release_id}/attach_files", file=path)
                if not isinstance(attachment, dict) or attachment.get("name") != path.name or not attachment.get("browser_download_url"):
                    raise GiteeError("Gitee POST returned incomplete attachment metadata", retryable=True)
                existing[path.name] = attachment
                print(f"Uploaded {path.name}", flush=True)
                break
            except GiteeError as error:
                if not error.retryable:
                    raise
                # A disconnected POST may have succeeded server-side. Re-list
                # before another POST to avoid duplicate immutable filenames.
                existing.update(self.attachments(release_id))
                attachment = existing.get(path.name)
                if attachment is not None:
                    print(f"Recovered completed upload {path.name}", flush=True)
                    break
                if attempt == ATTEMPTS:
                    raise
                wait_retry(error, attempt, path.name)
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
    metadata = {
        "tag_name": tag,
        "target_commitish": target_commit,
        "name": release["name"] or tag,
        "body": (release["body"] or "") + f"\n\n同步自 GitHub：{release['url']}",
    }
    target = client.request("GET", "/releases/tags/" + urllib.parse.quote(tag, safe=""))
    if target is None:
        target = client.request("POST", "/releases", payload={**metadata, "prerelease": True})
    release_id = target["id"]
    existing = client.attachments(release_id)
    complete_names = {*payload_names, "catalog.json", "SHA256SUMS.txt"}
    if complete_names - existing.keys() and not target.get("prerelease"):
        client.request("PATCH", f"/releases/{release_id}", payload={**metadata, "prerelease": True})
    urls = {}
    failures = []
    for name in payload_names:
        try:
            urls[name] = client.ensure_attachment(release_id, folder / name, existing)
        except GiteeError as error:
            if not error.retryable:
                raise
            failures.append(f"{name}: {error}")
            print(f"Deferred {name}; continuing other attachments: {error}", flush=True)
    if failures:
        raise GiteeError("Incomplete Gitee payload; catalog not published. " + "; ".join(failures), retryable=True)
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
    client.request("PATCH", f"/releases/{release_id}", payload={**metadata, "prerelease": False})
    print(f"Verified Gitee Release: https://gitee.com/{REPOSITORY}/releases/tag/{tag}", flush=True)


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
