import copy
import hashlib
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import verify_release as audit


class ReleaseVerificationTests(unittest.TestCase):
    def setUp(self):
        self.tag = "library-v2.3.4"
        self.source_base = f"https://github.com/{audit.GITHUB}/releases/download/{self.tag}/"
        self.mirror_base = f"https://gitee.com/{audit.GITEE}/releases/download/{self.tag}/"
        self.files = {}
        self.payloads = {"sample-1.0.0.zip": b"a deterministic ZIP fixture", "sample-1.0.0-cover.jpg": b"cover fixture"}
        self.catalog = {"schemaVersion": 1, "version": "2.3.4", "wallpapers": [{
            "id": "sample", "version": "1.0.0", "name": "Sample", "size": len(self.payloads["sample-1.0.0.zip"]),
            "sha256": self.digest(self.payloads["sample-1.0.0.zip"]),
            "downloadUrl": self.source_base + "sample-1.0.0.zip", "coverUrl": self.source_base + "sample-1.0.0-cover.jpg"}]}
        self.source = self.release(self.source_base, self.catalog)
        mirrored = copy.deepcopy(self.catalog)
        for field in ("downloadUrl", "coverUrl"):
            mirrored["wallpapers"][0][field] = mirrored["wallpapers"][0][field].replace(self.source_base, self.mirror_base)
        self.mirror = self.release(self.mirror_base, mirrored)
        # Gitee's automatic archives are not uploaded wallpaper payloads.
        self.mirror["assets"].append({"name": "Source code(zip)", "browser_download_url": self.mirror_base + "source.zip"})
        self.metadata = {
            f"{audit.SOURCE_API}/tags/{self.tag}": self.source,
            f"{audit.MIRROR_API}/tags/{self.tag}": self.mirror,
            audit.SOURCE_API + "/latest": self.source,
            audit.MIRROR_API + "/latest": self.mirror,
        }
        self.files[f"https://github.com/{audit.GITHUB}/releases/latest/download/catalog.json"] = self.files[self.source_base + "catalog.json"]
        self.refs = {"refs/heads/main": "a" * 40, f"refs/tags/{self.tag}": "b" * 40,
                     f"refs/tags/{self.tag}^{{}}": "c" * 40}
        self.requested = []

    @staticmethod
    def digest(data):
        return hashlib.sha256(data).hexdigest()

    def release(self, base, catalog):
        files = {**self.payloads, "catalog.json": json.dumps(catalog).encode()}
        sums = "".join(f"{self.digest(data)}  {name}\n" for name, data in sorted(files.items())).encode()
        files["SHA256SUMS.txt"] = sums
        self.files.update({base + name: data for name, data in files.items()})
        return {"tag_name": self.tag, "draft": False, "prerelease": False,
                "assets": [{"name": name, "size": len(data), "browser_download_url": base + name} for name, data in files.items()]}

    def read(self, url):
        self.requested.append(url)
        if url in self.metadata:
            return json.dumps(self.metadata[url]).encode()
        return self.files[url]

    def download(self, url):
        data = self.files[url]
        return self.digest(data), len(data)

    def verify(self, **kwargs):
        with patch.object(audit, "read_bytes", side_effect=self.read), \
             patch.object(audit, "download", side_effect=self.download), \
             patch.object(audit, "remote_refs", return_value=self.refs):
            return audit.verify(self.tag, **kwargs)

    def test_complete_release_verifies_actual_payloads_and_latest(self):
        result = self.verify()
        self.assertTrue(result["verified"])
        self.assertTrue(result["latest_checked"])
        self.assertEqual(result["release_assets"], 4)
        self.assertEqual(result["verified_payloads_per_host"], 2)
        self.assertIn(audit.MIRROR_API + "/latest", self.requested)

    def test_missing_payload_fails_even_when_release_exists(self):
        self.mirror["assets"] = [a for a in self.mirror["assets"] if a["name"] != "sample-1.0.0.zip"]
        with self.assertRaisesRegex(ValueError, "Missing Gitee attachments"):
            self.verify()

    def test_public_download_corruption_fails(self):
        self.files[self.mirror_base + "sample-1.0.0.zip"] = b"corrupt"
        with self.assertRaisesRegex(ValueError, "Downloaded payload checksum mismatch"):
            self.verify()

    def test_catalog_differences_beyond_urls_fail(self):
        mirrored = json.loads(self.files[self.mirror_base + "catalog.json"])
        mirrored["wallpapers"][0]["name"] = "Unexpected change"
        replacement = self.release(self.mirror_base, mirrored)
        self.mirror.update(replacement)
        with self.assertRaisesRegex(ValueError, "Catalogs differ beyond"):
            self.verify()

    def test_unpublished_or_incomplete_release_fails(self):
        self.mirror["prerelease"] = True
        with self.assertRaisesRegex(ValueError, "not published and stable"):
            self.verify()

    def test_stale_latest_fails(self):
        stale = copy.deepcopy(self.mirror)
        stale["tag_name"] = "library-v2.3.3"
        self.metadata[audit.MIRROR_API + "/latest"] = stale
        with self.assertRaisesRegex(ValueError, "Unexpected release tag"):
            self.verify()

    def test_historical_mode_does_not_require_latest_to_be_old(self):
        self.metadata.pop(audit.SOURCE_API + "/latest")
        self.metadata.pop(audit.MIRROR_API + "/latest")
        self.assertFalse(self.verify(historical=True)["latest_checked"])
        self.assertFalse(any("/latest" in url for url in self.requested))

    def test_source_branch_divergence_fails(self):
        mirror_refs = {**self.refs, "refs/heads/main": "d" * 40}
        with patch.object(audit, "read_bytes", side_effect=self.read), \
             patch.object(audit, "download", side_effect=self.download), \
             patch.object(audit, "remote_refs", side_effect=[self.refs, mirror_refs]):
            with self.assertRaisesRegex(ValueError, "main/tag refs differ"):
                audit.verify(self.tag)

    def test_duplicate_checksum_entries_are_rejected(self):
        entry = f"{'a' * 64}  catalog.json\n".encode()
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            audit.checksums(entry + entry)


if __name__ == "__main__":
    unittest.main()
