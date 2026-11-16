import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import build
from matrix_content import artifacts, sync
from matrix_poetry import package_files


class MatrixLargeCorpus(unittest.TestCase):
    def test_more_than_host_file_limit_is_packed_into_fresh_offline_shards(self):
        original = build.ROOT
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            folder = root / 'wallpapers/matrix-echo'
            source = folder / 'content/poems'; source.mkdir(parents=True)
            (root / 'library.json').write_text(json.dumps(dict(schemaVersion=1, version='1.0.0', repository='whoarei/wallpapers')))
            (folder / 'module.json').write_text(json.dumps(dict(id='matrix-echo', name='Matrix', version='1.0.0')))
            (folder / 'index.html').write_text('<script src="poems.generated.js"></script>')
            (folder / 'poems.generated.js').write_text('stale manifest')
            (folder / 'data').mkdir()
            (folder / 'data/poems-9999.js').write_text('stale shard')
            for i in range(4097):
                (source / f'entry-{i:05}.json').write_text(json.dumps(dict(id=f'entry-{i}', title=f'作品{i}', author='测试', verses=['明月松间照，清泉石上流。'], collection='测试选集', source='古籍出处')), encoding='utf-8')
            try:
                build.ROOT = root; build.build()
                package = root / 'dist/matrix-echo-1.0.0.zip'
                first = package.read_bytes()
                with zipfile.ZipFile(package) as archive:
                    names = archive.namelist()
                    self.assertLess(len(names), 4096)
                    self.assertFalse(any(n.startswith('content/poems/') for n in names))
                    self.assertNotIn('data/poems-9999.js', names)
                    self.assertIn('MATRIX_POEM_CHUNKS', archive.read('poems.generated.js').decode())
                    shards = [n for n in names if n.startswith('data/')]
                    self.assertEqual(len(shards), 17)
                    self.assertIn('entry-4096', archive.read(shards[-1]).decode())
                    self.assertTrue(all('古籍出处' in archive.read(n).decode() for n in shards))
                build.build(); self.assertEqual(first, package.read_bytes())
            finally:
                build.ROOT = original

    def test_preview_sync_checks_every_shard_and_removes_only_obsolete_kind(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            records = [dict(id=f'entry-{i}') for i in range(513)]
            files = artifacts('poems', records, {})
            sync(folder, files, 'poems')
            sync(folder, files, 'poems', check=True)
            (folder / 'data/poems-0001.js').write_text('corrupted')
            with self.assertRaises(SystemExit): sync(folder, files, 'poems', check=True)
            (folder / 'data/glyphs-9999.js').write_text('keep other kind')
            smaller = artifacts('poems', records[:257], {})
            sync(folder, smaller, 'poems')
            self.assertFalse((folder / 'data/poems-0002.js').exists())
            self.assertTrue((folder / 'data/glyphs-9999.js').exists())


if __name__ == '__main__': unittest.main()
