from __future__ import annotations

import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PromptStackFrontendRuntimeTests(unittest.TestCase):
    def test_classic_native_controls_execute_without_dom_widget_api(self) -> None:
        result = subprocess.run(
            [
                "node",
                str(ROOT / "tests/js/nova_prompt_stack_classic.test.mjs"),
                str(ROOT / "web/nova_prompt_stack_aio.js"),
            ],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)

    def test_fixed_scroll_panel_executes_in_classic_and_nodes_2(self) -> None:
        result = subprocess.run(
            [
                "node",
                str(ROOT / "tests/js/nova_prompt_stack_dom.test.mjs"),
                str(ROOT / "web/nova_prompt_stack_aio.js"),
            ],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
