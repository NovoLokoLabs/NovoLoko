from __future__ import annotations

import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class Music3FrontendRuntimeTests(unittest.TestCase):
    def test_controls_fill_resize_restore_and_hide_native_widgets_in_both_frontends(self) -> None:
        result = subprocess.run(
            [
                "node",
                str(ROOT / "tests/js/nova_music3_controls.test.mjs"),
                str(ROOT / "web/nova_music3.js"),
            ],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
