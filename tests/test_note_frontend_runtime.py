from __future__ import annotations

import shutil
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class NoteFrontendRuntimeTests(unittest.TestCase):
    def test_notes2_mount_and_serialization_decisions_execute_in_node(self) -> None:
        node = shutil.which("node")
        self.assertIsNotNone(
            node,
            "Node.js is required for executable frontend regression tests",
        )
        script = (
            ROOT / "tests" / "js" / "nova_note_state.test.mjs"
        ).read_text(encoding="utf-8")
        completed = subprocess.run(
            [
                node,
                "--input-type=module",
                "-",
                str(ROOT / "web" / "nova_note_state.js"),
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
            "NovoLoko Notes executable compatibility state tests passed.",
            completed.stdout,
        )


if __name__ == "__main__":
    unittest.main()
