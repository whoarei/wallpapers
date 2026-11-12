"""Keep the offline runtime in each wallpaper identical to its shared source."""
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    source = (ROOT / 'scripts/wallpaper-runtime.js').read_bytes()
    stale = []
    for manifest in sorted((ROOT / 'wallpapers').glob('*/module.json')):
        target = manifest.parent / 'wallpaper-runtime.js'
        if args.check:
            if not target.exists() or target.read_bytes() != source:
                stale.append(str(target.relative_to(ROOT)))
        else:
            target.write_bytes(source)
    if stale:
        parser.exit(1, 'Run python scripts/sync_runtime.py: ' + ', '.join(stale) + '\n')


if __name__ == '__main__':
    main()
