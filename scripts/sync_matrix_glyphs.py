"""Refresh the offline floating-glyph preview after editing source JSON/font files."""
import argparse
from pathlib import Path
from matrix_glyphs import package_files
from matrix_content import sync

folder = Path(__file__).resolve().parent.parent / "wallpapers/matrix-echo"
parser = argparse.ArgumentParser()
parser.add_argument("--check", action="store_true")
args = parser.parse_args()
sync(folder, package_files(folder), "glyphs", args.check)
