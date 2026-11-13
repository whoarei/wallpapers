"""Refresh the offline floating-glyph preview after editing source JSON/font files."""
import argparse
from pathlib import Path
from matrix_glyphs import collect

folder = Path(__file__).resolve().parent.parent / "wallpapers/matrix-echo"
parser = argparse.ArgumentParser()
parser.add_argument("--check", action="store_true")
args = parser.parse_args()
data = collect(folder)
target = folder / "glyphs.generated.js"
if args.check:
    if not target.exists() or target.read_bytes() != data:
        raise SystemExit("Preview glyphs are stale; run python scripts/sync_matrix_glyphs.py")
else:
    target.write_bytes(data)
