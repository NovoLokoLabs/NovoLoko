from __future__ import annotations

from pathlib import Path
import tempfile
import unittest
import zipfile

from tools.verify_release_archive import verify_archive


class ReleaseArchiveTests(unittest.TestCase):
    def _zip(self, root: Path, name: str, members: dict[str, str]) -> Path:
        path = root / name
        with zipfile.ZipFile(path, "w") as archive:
            for member, content in members.items():
                archive.writestr(member, content)
        return path

    def test_accepts_only_canonical_install_folder(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive = self._zip(Path(temporary), "good.zip", {
                "ComfyUI-NovoLoko/__init__.py": "",
                "ComfyUI-NovoLoko/web/nova_music3.js": "",
            })
            self.assertEqual((2, "ComfyUI-NovoLoko"), verify_archive(str(archive)))

    def test_rejects_github_source_archive_folder(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive = self._zip(Path(temporary), "bad.zip", {
                "NovoLoko-main/__init__.py": "",
            })
            with self.assertRaisesRegex(ValueError, "ComfyUI-NovoLoko"):
                verify_archive(str(archive))

    def test_rejects_nested_or_mixed_roots(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive = self._zip(Path(temporary), "bad.zip", {
                "ComfyUI-NovoLoko/NovoLoko-main/__init__.py": "",
                "extra.txt": "",
            })
            with self.assertRaises(ValueError):
                verify_archive(str(archive))
