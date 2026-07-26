from __future__ import annotations

import importlib
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = "novoloko_ui_polish_tests"


def load_nodes():
    package = sys.modules.get(PACKAGE)
    if package is None:
        package = types.ModuleType(PACKAGE)
        package.__path__ = [str(ROOT)]
        sys.modules[PACKAGE] = package
    return importlib.import_module(f"{PACKAGE}.nodes")


class UiPolishTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.nodes = load_nodes()

    def test_visual_style_payload_is_paginated_sanitized_and_empty_search_stays_empty(self) -> None:
        styles = [
            {
                "name": f"{index:04d} | Style {index}",
                "prompt": f"prompt {index}",
                "negative": "bad",
                "category": "Art",
                "favorite": False,
            }
            for index in range(30)
        ]
        with (
            mock.patch.object(self.nodes, "_read_styles", return_value=styles),
            mock.patch.object(self.nodes, "_load_favorites", return_value=[]),
            mock.patch.object(self.nodes, "_resolve_csv_path", return_value="/private/styles.csv"),
        ):
            page = self.nodes._style_browser_payload("styles.csv", page=2, page_size=12)
            empty = self.nodes._style_browser_payload("styles.csv", search="impossible")

        self.assertEqual(12, len(page["items"]))
        self.assertEqual(3, page["page_count"])
        self.assertEqual("styles.csv", page["file_name"])
        self.assertNotIn("resolved_path", page)
        self.assertEqual([], empty["items"])
        self.assertEqual(0, empty["filtered_count"])
        self.assertEqual(["No Style", "0000 | No Style"], empty["styles"])

    def test_four_item_pages_and_safe_library_inventory(self) -> None:
        styles = [
            {
                "name": f"{index:04d} | Style {index}",
                "prompt": "prompt",
                "negative": "",
                "category": "Art",
                "favorite": False,
            }
            for index in range(9)
        ]
        with (
            mock.patch.object(self.nodes, "_read_styles", return_value=styles),
            mock.patch.object(self.nodes, "_load_favorites", return_value=[]),
            mock.patch.object(self.nodes, "_resolve_csv_path", return_value="/private/styles.csv"),
        ):
            page = self.nodes._style_browser_payload("styles.csv", page=1, page_size=4)
        self.assertEqual(4, len(page["items"]))
        self.assertEqual(3, page["page_count"])

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "csv/styles").mkdir(parents=True)
            (root / "styles/more").mkdir(parents=True)
            (root / "csv/styles/example.csv").write_text("name,prompt\n", encoding="utf-8")
            (root / "styles/more/example.yaml").write_text("styles: []\n", encoding="utf-8")
            (root / "styles/ignore.txt").write_text("private", encoding="utf-8")
            with mock.patch.object(self.nodes, "_node_dir", return_value=str(root)):
                choices = self.nodes._style_library_choices()
        self.assertEqual(
            ["csv/styles/example.csv", "styles/more/example.yaml"],
            [item["path"] for item in choices],
        )
        self.assertTrue(all(not Path(item["path"]).is_absolute() for item in choices))

    def test_prompt_stack_restores_saved_manual_size(self) -> None:
        source = (ROOT / "web/nova_prompt_stack_aio.js").read_text(encoding="utf-8")

        self.assertIn("function configureProNode(node, newNode = false)", source)
        self.assertIn("if (newNode && !node.__novaAIOInitialSizeApplied)", source)
        self.assertEqual(1, source.count("node.setSize?.([820, 1580])"))
        self.assertNotIn("Math.max(Number(oldSize[0])", source)
        self.assertNotIn("Math.max(Number(node.size?.[0])", source)

    def test_memory_manager_width_is_capped_after_comfy_size_calculation(self) -> None:
        source = (ROOT / "web/memory_manager_compact.js").read_text(encoding="utf-8")

        self.assertIn("node.computeSize = function", source)
        self.assertIn("Math.min(245", source)
        self.assertIn('trim_current_process: "Trim process"', source)

    def test_visual_browser_has_search_favorites_history_and_pagination(self) -> None:
        source = (ROOT / "web/nova_style_dropdown.js").read_text(encoding="utf-8")

        for marker in (
            "NovoLoko Visual Style Library",
            "favoritesOnly",
            "historyOnly",
            "page_size",
            "Search style names and prompt text",
            "Browse styles visually",
            "/nova_styles_csv_pro/libraries",
            "for (const amount of [4, 9, 24, 50])",
            "storedStandaloneLibrary()",
            'dialog.addEventListener("contextmenu"',
        ):
            self.assertIn(marker, source)
        self.assertNotIn("resolved_path", source)


if __name__ == "__main__":
    unittest.main()
