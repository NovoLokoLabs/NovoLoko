from __future__ import annotations

import unittest
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class MusicDataV2FrontendTests(unittest.TestCase):
    def test_genre_to_style_filter_is_data_driven_and_legacy_safe(self):
        source = (ROOT / "web" / "nova_music3_data_v2.js").read_text(encoding="utf-8")
        self.assertIn('api.fetchApi("/nova_music3/controls")', source)
        self.assertIn("payload.style_parent_map[item.value] === selectedGenre", source)
        self.assertIn("SPECIAL_VALUES", source)
        self.assertIn("Never erase a legacy/manual style", source)
        self.assertIn('findCategoryRow(root, "Genre")', source)
        self.assertIn('findCategoryRow(root, "Style / era")', source)

    def test_music_dom_wheel_handoff_is_directional_and_selection_independent(self):
        source = (ROOT / "web" / "nova_music3_data_v2.js").read_text(encoding="utf-8")
        self.assertIn("scrollableAncestorForDelta", source)
        self.assertNotIn("selectedNode(currentNode, root)", source)
        self.assertIn("event.stopPropagation();", source)
        self.assertIn("event.preventDefault();", source)
        self.assertIn("event.stopImmediatePropagation();", source)
        self.assertIn("forwardWheelToCanvas(event);", source)
        self.assertIn('installRoot(root, CONTROLS_NODE)', source)
        self.assertIn('installRoot(root, LIBRARY_NODE)', source)
        self.assertIn('installRoot(root, PROMPT_STACK_NODE)', source)

    def test_wheel_handoff_runtime_matrix(self):
        result = subprocess.run(
            [
                "node",
                str(ROOT / "tests/js/nova_dom_wheel_handoff.test.mjs"),
                str(ROOT / "web/nova_music3_data_v2.js"),
            ],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
