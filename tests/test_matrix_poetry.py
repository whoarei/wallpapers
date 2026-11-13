import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import build
from matrix_poetry import collect, identity


class MatrixPoetry(unittest.TestCase):
    def poem(self, **changes):
        return dict(title="山居秋暝", author="王维", verses=["明月松间照，清泉石上流。"], **changes)

    def test_identity_matches_browser_format(self):
        self.assertEqual(identity("山居秋暝", "王维"), "poem-d221ffd0")

    def test_new_file_is_collected_during_packaging_even_with_stale_preview(self):
        original = build.ROOT
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            folder = root / "wallpapers/matrix-echo"
            poems = folder / "content/poems"
            poems.mkdir(parents=True)
            (root / "library.json").write_text(json.dumps(dict(schemaVersion=1, version="1.0.0", repository="whoarei/wallpapers")))
            (folder / "module.json").write_text(json.dumps(dict(id="matrix-echo", name="Matrix", version="1.0.0", entry="index.html")))
            (folder / "index.html").write_text('<script src="poems.generated.js"></script>')
            (folder / "poems.generated.js").write_text("stale preview")
            (poems / "first.json").write_text(json.dumps(self.poem()), encoding="utf-8")
            (poems / "second.json").write_text(json.dumps(dict(title="登鹳雀楼", author="王之涣", verses=["白日依山尽，黄河入海流。"])), encoding="utf-8")
            try:
                build.ROOT = root
                build.build()
                first = (root / "dist/matrix-echo-1.0.0.zip").read_bytes()
                with zipfile.ZipFile(root / "dist/matrix-echo-1.0.0.zip") as archive:
                    generated = archive.read("poems.generated.js").decode()
                    self.assertIn("明月松间照，清泉石上流。", generated)
                    self.assertIn("白日依山尽，黄河入海流。", generated)
                    self.assertIn('"poem-d221ffd0": "first.json"', generated)
                    self.assertNotIn("stale preview", generated)
                    self.assertIn("content/poems/second.json", archive.namelist())
                build.build()
                self.assertEqual(first, (root / "dist/matrix-echo-1.0.0.zip").read_bytes())
            finally:
                build.ROOT = original

    def test_invalid_sources_report_file_and_field(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            data = folder / "content/poems"
            data.mkdir(parents=True)
            for patch in [{"verses": []}, {"verses": ["山" * 121]}, {"author": 123}, {"dynasty": None}, {"enabled": "false"}, {"id": "../escape"}]:
                value = {**self.poem(), **patch}
                (data / "bad.json").write_text(json.dumps(value), encoding="utf-8")
                with self.subTest(patch=patch), self.assertRaisesRegex(ValueError, r"content/poems/bad.json"):
                    collect(folder)

    def test_duplicate_identity_rejected_and_script_text_escaped(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            data = folder / "content/poems"
            data.mkdir(parents=True)
            value = self.poem()
            value["verses"] = ["</script>\u2028山水"]
            (data / "first.json").write_text(json.dumps(value), encoding="utf-8")
            self.assertNotIn("</script>", collect(folder).decode())
            (data / "second.json").write_text(json.dumps(value), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate poem id"):
                collect(folder)


if __name__ == "__main__":
    unittest.main()
