from __future__ import annotations

import shutil
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class CompareFrontendRuntimeTests(unittest.TestCase):
    def test_compare_surface_state_and_rendering_decisions_execute_in_node(self) -> None:
        node = shutil.which("node")
        self.assertIsNotNone(node, "Node.js is required for executable frontend regression tests")
        script = (
            ROOT / "tests" / "js" / "nova_compare_state.test.mjs"
        ).read_text(encoding="utf-8")
        completed = subprocess.run(
            [
                node,
                "--input-type=module",
                "-",
                str(ROOT / "web" / "nova_compare_state.js"),
            ],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            input=script,
        )
        self.assertEqual(
            0,
            completed.returncode,
            msg=f"{completed.stdout}\n{completed.stderr}",
        )
        self.assertIn(
            "NovoLoko Compare executable frontend state tests passed.",
            completed.stdout,
        )


if __name__ == "__main__":
    unittest.main()
