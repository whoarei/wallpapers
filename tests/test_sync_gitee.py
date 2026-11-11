import hashlib
import io
import json
import tempfile
import unittest
import urllib.error
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

    def request(self, method, path, payload=None, file=None):
        if method == "GET" and path.startswith("/releases/tags/"):
            return self.release
        if method == "POST" and path == "/releases":
            self.release = {"id": 42, **payload}
            return self.release
        if method == "GET" and "/attach_files?" in path:
            return [item[0] for item in self.files.values()]
        if method == "POST" and path == "/releases/42/attach_files":
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
        self.sync()
        self.assertEqual(len(self.client.uploads), 4)
        self.assertEqual({p.name: p.read_bytes() for p in self.folder.iterdir()}, originals)

    def test_interrupted_upload_can_resume(self):
        self.client.fail_once = "catalog.json"
        with self.assertRaisesRegex(RuntimeError, "Interrupted"):
            self.sync()
        self.assertEqual(len(self.client.uploads), 2)
        self.sync()
        self.assertEqual(len(self.client.uploads), 4)

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
    def test_multipart_upload_uses_documented_file_and_access_token_fields(self):
        with tempfile.TemporaryDirectory() as temp:
            file = Path(temp) / "scene.zip"
            file.write_bytes(b"archive bytes")
            with patch.object(sync_gitee.urllib.request, "urlopen", return_value=io.BytesIO(b'{"id": 7}')) as open_url:
                result = sync_gitee.Gitee("secret").request("POST", "/releases/42/attach_files", file=file)
            request = open_url.call_args.args[0]
            self.assertEqual(request.full_url, sync_gitee.API + "/releases/42/attach_files")
            self.assertEqual(result, {"id": 7})
            self.assertIn(b'name="access_token"\r\n\r\nsecret', request.data)
            self.assertIn(b'name="file"; filename="scene.zip"', request.data)
            self.assertIn(b"archive bytes", request.data)

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
