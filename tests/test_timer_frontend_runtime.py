from __future__ import annotations

import subprocess
import shutil
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class TimerFrontendRuntimeTests(unittest.TestCase):
    def test_nodes2_timer_layout_helpers_execute_in_node(self) -> None:
        node = shutil.which("node")
        self.assertIsNotNone(
            node,
            "Node.js is required for executable frontend regression tests",
        )
        script = (
            ROOT / "tests" / "js" / "nova_timer_layout_state.test.mjs"
        ).read_text(encoding="utf-8")
        result = subprocess.run(
            [
                node,
                "--input-type=module",
                "-",
                str(ROOT / "web" / "nova_timer_layout_state.js"),
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
            result.returncode,
            msg=f"{result.stdout}\n{result.stderr}",
        )
        self.assertIn(
            "NovoLoko Timer executable Nodes 2.0 layout tests passed.",
            result.stdout,
        )


if __name__ == "__main__":
    unittest.main()
