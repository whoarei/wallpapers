"""Refresh the checked-in preview data after adding poem files."""
import argparse
from pathlib import Path
from matrix_poetry import collect

root = Path(__file__).resolve().parent.parent
folder = root / "wallpapers" / "matrix-echo"
parser = argparse.ArgumentParser()
parser.add_argument("--check", action="store_true")
args = parser.parse_args()
data = collect(folder)
target = folder / "poems.generated.js"
if args.check:
    if not target.exists() or target.read_bytes() != data:
        raise SystemExit("Preview poems are stale; run python scripts/sync_matrix_poetry.py")
else:
    target.write_bytes(data)
