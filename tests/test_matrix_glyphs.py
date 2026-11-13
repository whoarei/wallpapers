import json
import shutil
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build
from matrix_glyphs import collect, font_coverage, identity, normalize, woff_codepoints


class MatrixGlyphs(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.coverage = font_coverage(ROOT / "wallpapers/matrix-echo")

    def glyph(self, **changes):
        return dict(script="seal", character="鹿", reading="lù", description="鹿科动物。\n常见于山林。", **changes)

    def fixture(self, root):
        folder = root / "wallpapers/matrix-echo"
        source = folder / "content/glyphs"
        source.mkdir(parents=True)
        shutil.copytree(ROOT / "wallpapers/matrix-echo/fonts", folder / "fonts")
        (root / "library.json").write_text(json.dumps(dict(schemaVersion=1, version="1.0.0", repository="whoarei/wallpapers")))
        (folder / "module.json").write_text(json.dumps(dict(id="matrix-echo", name="Matrix", version="1.0.0", entry="index.html")))
        (folder / "index.html").write_text('<script src="glyphs.generated.js"></script>')
        (folder / "glyphs.js").write_text("// glyph API")
        (folder / "glyphs.generated.js").write_text("stale glyph preview")
        (folder / "content/poems").mkdir()
        (folder / "content/poems/poem.json").write_text(json.dumps(dict(title="山居秋暝", author="王维", verses=["明月松间照，清泉石上流。"])))
        (folder / "poems.generated.js").write_text("stale poem preview")
        return folder, source

    def test_schema_identity_and_actual_font_coverage(self):
        self.assertEqual(identity("seal", "鹿"), "glyph-seal-9e7f")
        self.assertEqual(normalize(self.glyph(), self.coverage)["description"], self.glyph()["description"])
        self.assertIn(ord("鹿"), woff_codepoints(ROOT / "wallpapers/matrix-echo/fonts/Seal.woff"))
        for patch in [dict(script=[]), dict(script="unknown"), dict(character="山水"), dict(character="𠀀"), dict(description=""),
                      dict(description="字" * 601), dict(enabled="false"), dict(reading="a\nb"), dict(id="../escape"),
                      dict(script="tibetan", character="ི")]:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                normalize({**self.glyph(), **patch}, self.coverage)

    def test_json_only_changes_are_collected_into_deterministic_packages(self):
        original = build.ROOT
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            folder, source = self.fixture(root)
            (source / "deer.json").write_text(json.dumps(self.glyph()), encoding="utf-8")
            try:
                build.ROOT = root
                build.build()
                archive_path = root / "dist/matrix-echo-1.0.0.zip"
                first = archive_path.read_bytes()
                with zipfile.ZipFile(archive_path) as archive:
                    generated = archive.read("glyphs.generated.js").decode()
                    self.assertIn('"character": "鹿"', generated)
                    self.assertIn('"glyph-seal-9e7f": "deer.json"', generated)
                    self.assertIn("MATRIX_GLYPH_COVERAGE", generated)
                    self.assertNotIn("stale glyph preview", generated)
                    self.assertIn("content/glyphs/deer.json", archive.namelist())
                build.build()
                self.assertEqual(first, archive_path.read_bytes())
            finally:
                build.ROOT = original

    def test_duplicates_invalid_records_and_script_delimiters(self):
        with tempfile.TemporaryDirectory() as temp:
            folder, source = self.fixture(Path(temp))
            value = {**self.glyph(), "description": "</script>\u2028山水"}
            (source / "first.json").write_text(json.dumps(value), encoding="utf-8")
            self.assertNotIn("</script>", collect(folder).decode())
            (source / "duplicate.json").write_text(json.dumps({**value, "id": "different-id"}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate glyph"):
                collect(folder)
            (source / "duplicate.json").unlink()
            (source / "invalid.json").write_text(json.dumps({**value, "character": "𠀀"}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "content/glyphs/invalid.json"):
                collect(folder)


if __name__ == "__main__":
    unittest.main()
