import json
import tempfile
import unittest
import zipfile
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import build


class Packages(unittest.TestCase):
    def test_unsafe_paths_are_rejected(self):
        for path in ("../escape", "/absolute", "a/../b", "a/./b", "a//b", "C:/file", "a\\b", "NUL.txt", "x/CON", "x.", "x ", "a:stream", "x%2f.txt", "a\x01b"):
            self.assertFalse(build.safe_path(path), path)
        self.assertTrue(build.safe_path("assets/fish.png"))

    def test_manifest_types_match_client_contract(self):
        valid = {"id": "scene", "name": "Scene", "version": "1.0.0"}
        build.validate_metadata(valid, "scene")
        for patch in ({"name": 1}, {"tags": "pixel"}, {"minAppVersion": "latest"}, {"version": "01.0.0"}, {"schemaVersion": True}, {"enabled": "false"}, {"order": 2.5}, {"order": 1 << 64}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                build.validate_metadata({**valid, **patch}, "scene")

    def test_deterministic_packages_and_version_guard(self):
        with tempfile.TemporaryDirectory(prefix="wallpapers-build-") as temp:
            original_root = build.ROOT
            build.ROOT = root = Path(temp)
            try:
                (root / "library.json").write_text(json.dumps({"schemaVersion": 1, "version": "1.0.0", "repository": "whoarei/wallpapers"}))
                folder = root / "wallpapers" / "test-scene"
                folder.mkdir(parents=True)
                metadata = {"id": "test-scene", "version": "1.0.0", "name": "Test", "entry": "index.html"}
                (folder / "module.json").write_text(json.dumps(metadata))
                (folder / "index.html").write_bytes(b"<h1>Scene</h1>\n")
                build.build()
                first = (root / "dist/test-scene-1.0.0.zip").read_bytes()
                prior = root / "prior.json"
                prior.write_bytes((root / "dist/catalog.json").read_bytes())
                build.build(prior)
                self.assertEqual(first, (root / "dist/test-scene-1.0.0.zip").read_bytes())
                (folder / "index.html").write_bytes(b"<h1>Scene</h1>\r\n")
                build.build(prior)
                self.assertEqual(first, (root / "dist/test-scene-1.0.0.zip").read_bytes())
                with zipfile.ZipFile(root / "dist/test-scene-1.0.0.zip") as archive:
                    self.assertEqual(archive.namelist(), ["index.html", "module.json"])
                (folder / "index.html").write_text("<h1>Changed</h1>")
                with self.assertRaisesRegex(ValueError, "Bump wallpaper version"):
                    build.build(prior)
            finally:
                build.ROOT = original_root


if __name__ == "__main__":
    unittest.main()
