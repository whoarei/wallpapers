import hashlib
import io
import json
import tempfile
import unittest
import urllib.error
import subprocess
import threading
import shutil
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from email.parser import BytesParser
from email.policy import default
from pathlib import Path
from unittest.mock import patch
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import sync_gitee


class FakeGitee(sync_gitee.Gitee):
    """In-memory Gitee transport; exercise the actual sync and upload logic."""
    def __init__(self):
        self.release = None
        self.files = {}
        self.uploads = []
        self.fail_once = None
        self.network_failures = {}
        self.lose_response_once = None
        self.attempts = []
        self.patches = []

    def request(self, method, path, payload=None, file=None):
        if method == "GET" and path.startswith("/releases/tags/"):
            return self.release
        if method == "POST" and path == "/releases":
            self.release = {"id": 42, **payload}
            return self.release
        if method == "PATCH" and path == "/releases/42":
            if not {"tag_name", "name", "body"} <= payload.keys():
                raise AssertionError("Gitee requires complete release metadata even for prerelease updates")
            self.release.update(payload)
            self.patches.append(payload)
            return self.release
        if method == "GET" and "/attach_files?" in path:
            return [item[0] for item in self.files.values()]
        if method == "POST" and path == "/releases/42/attach_files":
            self.attempts.append(file.name)
            if self.network_failures.get(file.name, 0):
                self.network_failures[file.name] -= 1
                raise sync_gitee.GiteeError("Disconnected upload", retryable=True)
            if self.fail_once == file.name:
                self.fail_once = None
                raise RuntimeError("Interrupted upload")
            attachment = {
                "id": len(self.files) + 1,
                "name": file.name,
                "browser_download_url": f"https://gitee.com/attachments/{len(self.files) + 1}",
            }
            self.files[file.name] = (attachment, file.read_bytes())
            self.uploads.append(file.name)
            if self.lose_response_once == file.name:
                self.lose_response_once = None
                raise sync_gitee.GiteeError("Lost successful POST response", retryable=True)
            return attachment
        raise AssertionError((method, path))

    def download_digest(self, url):
        for attachment, contents in self.files.values():
            if attachment["browser_download_url"] == url:
                return hashlib.sha256(contents).hexdigest()
        raise AssertionError(url)


class GiteeSync(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.release = {
            "tagName": "library-v1.2.0", "name": "壁纸库 1.2.0", "body": "版本说明",
            "url": "https://github.com/whoarei/wallpapers/releases/tag/library-v1.2.0",
            "isDraft": False, "isPrerelease": False,
        }
        self.client = FakeGitee()
        self.download_patch = patch.object(sync_gitee, "download_digest", self.client.download_digest)
        self.download_patch.start()
        self.addCleanup(self.download_patch.stop)
        self.sleep_patch = patch.object(sync_gitee.time, "sleep")
        self.sleep_patch.start()
        self.addCleanup(self.sleep_patch.stop)
        (self.folder / "scene-1.0.0.zip").write_bytes(b"original wallpaper archive")
        (self.folder / "scene-1.0.0-cover.jpg").write_bytes(b"original cover")
        catalog = {"version": "1.2.0", "schemaVersion": 1, "wallpapers": [{
            "id": "scene", "version": "1.0.0", "size": 26,
            "sha256": sync_gitee.digest(self.folder / "scene-1.0.0.zip"),
            "downloadUrl": "https://github.com/whoarei/wallpapers/releases/download/library-v1.2.0/scene-1.0.0.zip",
            "coverUrl": "https://github.com/whoarei/wallpapers/releases/download/library-v1.2.0/scene-1.0.0-cover.jpg",
        }]}
        (self.folder / "catalog.json").write_text(json.dumps(catalog), encoding="utf-8")
        self.write_checksums()

    def write_checksums(self):
        names = sorted(p.name for p in self.folder.iterdir() if p.name != "SHA256SUMS.txt")
        (self.folder / "SHA256SUMS.txt").write_text("".join(
            f"{sync_gitee.digest(self.folder / name)}  {name}\n" for name in names
        ), encoding="utf-8")

    def sync(self):
        sync_gitee.sync(self.folder, self.release, "whoarei/wallpapers", "a" * 40, self.client)

    def test_mirror_rewrites_urls_checksums_and_reuses_verified_attachments(self):
        originals = {p.name: p.read_bytes() for p in self.folder.iterdir()}
        self.sync()
        mirrored = json.loads(self.client.files["catalog.json"][1])
        item = mirrored["wallpapers"][0]
        for field, name in (("downloadUrl", "scene-1.0.0.zip"), ("coverUrl", "scene-1.0.0-cover.jpg")):
            self.assertEqual(item[field], self.client.files[name][0]["browser_download_url"])
            self.assertEqual(self.client.files[name][1], originals[name])
        source_item = json.loads(originals["catalog.json"])["wallpapers"][0]
        self.assertEqual(item["sha256"], source_item["sha256"])
        self.assertEqual(item["size"], source_item["size"])
        sums = self.client.files["SHA256SUMS.txt"][1].decode().splitlines()
        for line in sums:
            checksum, name = line.split("  ")
            self.assertEqual(checksum, hashlib.sha256(self.client.files[name][1]).hexdigest())
        self.assertEqual(self.client.release["tag_name"], self.release["tagName"])
        self.assertEqual(self.client.release["target_commitish"], "a" * 40)
        self.assertIn(self.release["url"], self.client.release["body"])
        self.assertFalse(self.client.release["prerelease"])
        self.sync()
        self.assertEqual(len(self.client.uploads), 4)
        self.assertEqual({p.name: p.read_bytes() for p in self.folder.iterdir()}, originals)

    def test_interrupted_upload_can_resume(self):
        self.client.fail_once = "catalog.json"
        with self.assertRaisesRegex(RuntimeError, "Interrupted"):
            self.sync()
        self.assertEqual(len(self.client.uploads), 2)
        self.assertTrue(self.client.release["prerelease"], "incomplete mirrors are not stable releases")
        self.sync()
        self.assertEqual(len(self.client.uploads), 4)

    def test_transient_upload_failure_reconciles_then_retries(self):
        self.client.network_failures["scene-1.0.0.zip"] = 1
        self.sync()
        self.assertEqual(self.client.attempts.count("scene-1.0.0.zip"), 2)
        self.assertEqual(self.client.uploads.count("scene-1.0.0.zip"), 1)
        self.assertFalse(self.client.release["prerelease"])

    def test_lost_post_response_does_not_upload_duplicate(self):
        self.client.lose_response_once = "scene-1.0.0.zip"
        self.sync()
        self.assertEqual(self.client.attempts.count("scene-1.0.0.zip"), 1)
        self.assertEqual(self.client.uploads.count("scene-1.0.0.zip"), 1)
        self.assertFalse(self.client.release["prerelease"])

    def test_failed_file_does_not_block_other_files_or_publish_catalog(self):
        self.client.network_failures["scene-1.0.0-cover.jpg"] = sync_gitee.ATTEMPTS
        with self.assertRaisesRegex(sync_gitee.GiteeError, "catalog not published"):
            self.sync()
        self.assertIn("scene-1.0.0.zip", self.client.files)
        self.assertNotIn("catalog.json", self.client.files)
        self.assertNotIn("SHA256SUMS.txt", self.client.files)
        self.assertTrue(self.client.release["prerelease"])
        self.sync()
        self.assertEqual(self.client.uploads.count("scene-1.0.0.zip"), 1)
        self.assertFalse(self.client.release["prerelease"])

    def test_old_partial_stable_release_is_marked_until_repaired(self):
        self.client.release = {"id": 42, "prerelease": False}
        self.client.fail_once = "catalog.json"
        with self.assertRaises(RuntimeError):
            self.sync()
        self.assertTrue(any(p["prerelease"] for p in self.client.patches))
        self.assertTrue(self.client.release["prerelease"])

    def test_corrupt_source_fails_before_creating_release(self):
        (self.folder / "scene-1.0.0.zip").write_bytes(b"corrupt")
        with self.assertRaisesRegex(ValueError, "checksum mismatch"):
            self.sync()
        self.assertIsNone(self.client.release)

    def test_different_existing_attachment_is_not_overwritten(self):
        self.sync()
        attachment, _ = self.client.files["scene-1.0.0.zip"]
        self.client.files["scene-1.0.0.zip"] = (attachment, b"different remote content")
        with self.assertRaisesRegex(ValueError, "refusing to overwrite"):
            self.sync()
        self.assertEqual(len(self.client.uploads), 4)

    def test_invalid_catalog_or_release_fails_before_creating_release(self):
        for patch_release in ({"isDraft": True}, {"isPrerelease": True}, {"tagName": "other-v1.2.0"}):
            with self.subTest(patch_release=patch_release), self.assertRaises(ValueError):
                sync_gitee.sync(self.folder, {**self.release, **patch_release}, "whoarei/wallpapers", "a" * 40, self.client)
        catalog = json.loads((self.folder / "catalog.json").read_text())
        catalog["wallpapers"][0]["downloadUrl"] = "https://example.com/unexpected.zip"
        (self.folder / "catalog.json").write_text(json.dumps(catalog))
        self.write_checksums()
        with self.assertRaisesRegex(ValueError, "unexpected asset"):
            self.sync()
        self.assertIsNone(self.client.release)


class GiteeAPI(unittest.TestCase):
    @unittest.skipUnless(shutil.which("curl"), "streaming transport requires curl")
    def test_real_curl_uploads_multi_megabyte_multipart_and_expect_continue(self):
        captured = []

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *args):
                pass

            def do_POST(self):
                self.connection.settimeout(10)
                body = self.rfile.read(int(self.headers["Content-Length"]))
                message = BytesParser(policy=default).parsebytes(
                    ("Content-Type: " + self.headers["Content-Type"] + "\r\nMIME-Version: 1.0\r\n\r\n").encode() + body)
                captured.append({part.get_param("name", header="content-disposition"): part.get_payload(decode=True)
                                 for part in message.iter_parts()})
                response = b'{"id": 7}'
                self.send_response(201)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(response)))
                self.end_headers()
                self.wfile.write(response)

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            with tempfile.TemporaryDirectory() as temp, patch.object(sync_gitee, "API", f"http://127.0.0.1:{server.server_port}"):
                file = Path(temp) / "large scene.zip"
                payload = b"wallpaper-stream-" * 400000
                file.write_bytes(payload)
                self.assertGreater(len(payload), 5 * 1024 * 1024)
                self.assertEqual(sync_gitee.Gitee("test-token").request("POST", "/upload", file=file), {"id": 7})
            self.assertEqual(captured[0]["access_token"], b"test-token")
            self.assertEqual(hashlib.sha256(captured[0]["file"]).digest(), hashlib.sha256(payload).digest())
        finally:
            server.shutdown()
            server.server_close()
            worker.join(timeout=5)

    def test_upload_streams_file_and_passes_token_only_on_stdin(self):
        with tempfile.TemporaryDirectory() as temp:
            file = Path(temp) / "scene.zip"
            file.write_bytes(b"archive bytes")
            reply = subprocess.CompletedProcess([], 0, b'HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 201 Created\r\nContent-Type: application/json\r\n\r\n{"id": 7}\n__gitee_status__:201', b'')
            with patch.object(sync_gitee.subprocess, "run", return_value=reply) as run, patch.object(Path, "read_bytes", side_effect=AssertionError("upload must stream")):
                result = sync_gitee.Gitee("secret").request("POST", "/releases/42/attach_files", file=file)
            self.assertEqual(result, {"id": 7})
            self.assertEqual(run.call_args.args[0], ["curl", "--config", "-"])
            config = run.call_args.kwargs["input"].decode()
            self.assertIn('form-string = "access_token=secret"', config)
            self.assertIn('file=@', config)
            self.assertIn('scene.zip', config)
            self.assertIn('max-time = "600"', config)
            self.assertNotIn('archive bytes', config)

    def test_upload_transport_errors_are_retryable_and_redacted(self):
        reply = subprocess.CompletedProcess([], 56, b'\n__gitee_status__:000', b'connection reset secret')
        with patch.object(sync_gitee.subprocess, "run", return_value=reply):
            with self.assertRaises(sync_gitee.GiteeError) as caught:
                sync_gitee.Gitee("secret").request("POST", "/releases/42/attach_files", file=Path("scene.zip"))
        self.assertTrue(caught.exception.retryable)
        self.assertIn('curl 56', str(caught.exception))
        self.assertNotIn('secret', str(caught.exception))

    def test_upload_honors_http_retry_after_and_does_not_retry_auth_failure(self):
        for status, retryable in ((429, True), (403, False)):
            reply = subprocess.CompletedProcess([], 0, f'HTTP/1.1 {status} Error\r\nRetry-After: 19\r\n\r\nsecret\n__gitee_status__:{status}'.encode(), b'')
            with patch.object(sync_gitee.subprocess, "run", return_value=reply):
                with self.assertRaises(sync_gitee.GiteeError) as caught:
                    sync_gitee.Gitee("secret").request("POST", "/releases/42/attach_files", file=Path("scene.zip"))
            self.assertEqual(caught.exception.retryable, retryable)
            self.assertEqual(caught.exception.retry_after, 19)
            self.assertNotIn('secret', str(caught.exception))

    def test_metadata_get_retries_connection_reset_without_leaking_url(self):
        failures = [urllib.error.URLError(ConnectionResetError(104, 'secret')), io.BytesIO(b'{"id":7}')]
        with patch.object(sync_gitee.urllib.request, "urlopen", side_effect=failures), patch.object(sync_gitee.time, "sleep") as sleep:
            self.assertEqual(sync_gitee.Gitee("secret").request("GET", "/releases/tags/library-v1.2.0"), {"id": 7})
        sleep.assert_called_once_with(2)

    def test_404_is_distinct_from_authentication_errors_and_tokens_are_redacted(self):
        client = sync_gitee.Gitee("secret")
        for status in (404, 403):
            error = urllib.error.HTTPError("https://gitee.com?access_token=secret", status, "Error", {}, io.BytesIO(b"secret"))
            with patch.object(sync_gitee.urllib.request, "urlopen", side_effect=error):
                if status == 404:
                    self.assertIsNone(client.request("GET", "/releases/tags/library-v1.2.0"))
                else:
                    with self.assertRaises(RuntimeError) as caught:
                        client.request("GET", "/releases/tags/library-v1.2.0")
                    self.assertIn("HTTP 403", str(caught.exception))
                    self.assertNotIn("secret", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
