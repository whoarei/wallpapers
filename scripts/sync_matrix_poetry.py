"""Refresh the checked-in preview data after adding poem files."""
import argparse
from pathlib import Path
from matrix_poetry import package_files
from matrix_content import sync

root = Path(__file__).resolve().parent.parent
folder = root / "wallpapers" / "matrix-echo"
parser = argparse.ArgumentParser()
parser.add_argument("--check", action="store_true")
args = parser.parse_args()
sync(folder, package_files(folder), "poems", args.check)
