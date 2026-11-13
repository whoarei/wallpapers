"""Refresh the checked-in settings page after editing its template or shared editor."""
import argparse
from pathlib import Path
from matrix_settings import collect

folder = Path(__file__).resolve().parent.parent / "wallpapers/matrix-echo"
parser = argparse.ArgumentParser()
parser.add_argument("--check", action="store_true")
args = parser.parse_args()
data = collect(folder)
target = folder / "settings.html"
if args.check:
    if not target.exists() or target.read_bytes() != data:
        raise SystemExit("Settings preview is stale; run python scripts/sync_matrix_settings.py")
else:
    target.write_bytes(data)
