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

    def test_large_and_all_pages_and_safe_library_inventory(self) -> None:
        styles = [
            {
                "name": f"{index:04d} | Style {index}",
                "prompt": "prompt",
                "negative": "",
                "category": "Art",
                "favorite": False,
            }
            for index in range(125)
        ]
        with (
            mock.patch.object(self.nodes, "_read_styles", return_value=styles),
            mock.patch.object(self.nodes, "_load_favorites", return_value=[]),
            mock.patch.object(self.nodes, "_resolve_csv_path", return_value="/private/styles.csv"),
        ):
            page = self.nodes._style_browser_payload("styles.csv", page=1, page_size=100)
            whole_library = self.nodes._style_browser_payload(
                "styles.csv", page=1, page_size="all"
            )
        self.assertEqual(100, len(page["items"]))
        self.assertEqual(2, page["page_count"])
        self.assertEqual(125, len(whole_library["items"]))
        self.assertEqual(1, whole_library["page_count"])

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

    def test_standalone_library_endpoint_payload_has_a_resolvable_safe_default(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            default = root / "styles/novoloko_all_yaml_styles.yaml"
            default.parent.mkdir(parents=True)
            default.write_text("styles: []\n", encoding="utf-8")
            with (
                mock.patch.object(self.nodes, "_node_dir", return_value=str(root)),
                mock.patch.object(self.nodes, "_comfy_root", return_value=str(root / "comfy")),
            ):
                payload = self.nodes._style_library_payload()
                resolved = Path(self.nodes._resolve_csv_path(payload["default"]))

        self.assertTrue(payload["ok"])
        self.assertEqual("styles/novoloko_all_yaml_styles.yaml", payload["default"])
        self.assertIn(payload["default"], [item["path"] for item in payload["libraries"]])
        self.assertEqual(default, resolved)

    def test_prompt_stack_uses_a_fixed_internal_scroll_panel_without_slot_growth(self) -> None:
        source = (ROOT / "web/nova_prompt_stack_aio.js").read_text(encoding="utf-8")

        self.assertIn("function installDynamicNode(node, newNode = false)", source)
        self.assertIn("if (newNode && (!Array.isArray(node.size) || node.size[0] < 420))", source)
        self.assertIn("overflow-y:scroll", source)
        self.assertIn("scrollbar-gutter:stable", source)
        self.assertIn("getHeight: () => panelHeight(node) + PANEL_WIDGET_GAP", source)
        self.assertIn("installPanelResizeTracking(node)", source)
        self.assertIn("The slot canvas follows the node height", source)
        self.assertIn("getMinHeight: () => PANEL_MIN_HEIGHT + PANEL_WIDGET_GAP", source)
        self.assertIn("compact: 450", source)
        self.assertIn("comfortable: 520", source)
        self.assertIn("roomy: 600", source)
        self.assertNotIn("Math.max(Number(oldSize[0])", source)
        self.assertNotIn("Math.max(Number(node.size?.[0])", source)

    def test_prompt_stack_exposes_repeatable_reorderable_slot_controls(self) -> None:
        source = (ROOT / "web/nova_prompt_stack_aio.js").read_text(encoding="utf-8")

        for marker in (
            '"+ Add Slot"',
            '"Collapse All"',
            '"Expand All"',
            '"Refresh Folders + Files + Categories + Entries"',
            '"Clear Searches"',
            '"Browse Medium Styles"',
            '"file_path"',
            '"category"',
            '"search"',
            '"selection"',
            '"Up"',
            '"Down"',
            '"Copy"',
            '"Remove"',
            'widget(node, "slots_json")',
            "preserveBackendWidgetOrder(node)",
            "legacyState(node)",
            'const ALL_FOLDERS = "All folders"',
            "folder_search",
            "setFileOptions",
            "selectionSummary(slot)",
            "container-type:inline-size",
            'node.__novoAIORenderer === "native"',
            'addNativeControl(node, "combo"',
            "onConfigure",
            "onGraphConfigured",
        ):
            self.assertIn(marker, source)

        self.assertIn('item.options.serialize = false', source)
        self.assertIn('node.__novoAIORenderer ||= typeof node.addDOMWidget === "function" ? "dom" : "native"', source)

    def test_prompt_stack_persists_collapse_and_panel_size_in_slots_transport(self) -> None:
        source = (ROOT / "web/nova_prompt_stack_aio.js").read_text(encoding="utf-8")

        self.assertIn("version: 2", source)
        self.assertIn("ui: { panel_size:", source)
        self.assertIn('collapsed: Object.prototype.hasOwnProperty.call', source)
        self.assertIn('collapsed: false', source)  # Newly added slots start expanded.

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
            'for (const amount of [24, 50, 100, "all"])',
            "storedStandaloneLibrary()",
            "Choose which Prompt Stack or Style Loader receives standalone selections",
            "compatibleStyleTargets",
            "grid-auto-rows:max-content",
            "overflow-y:auto",
            'dialog.addEventListener("contextmenu"',
        ):
            self.assertIn(marker, source)
        self.assertNotIn("resolved_path", source)

    def test_all_novoloko_nodes_receive_compact_resizable_widths(self) -> None:
        source = (ROOT / "web/nova_compact_nodes.js").read_text(encoding="utf-8")
        self.assertIn('nodeTypeName.startsWith("Nova")', source)
        self.assertIn("DEFAULT_MIN_WIDTH = 150", source)
        self.assertIn("DOM_MIN_WIDTH = 210", source)
        self.assertIn("Math.min(RESET_WIDTH", source)
        self.assertIn("__novaResizePersistenceInstalled", source)
        self.assertIn("this.graph?.change?.()", source)
        self.assertIn("app.graph?.setDirtyCanvas?.(true, true)", source)
        self.assertIn('SAVED_SIZE_PROPERTY = "novaSavedManualSize"', source)
        self.assertIn('"NovaSeedLab"', source)
        self.assertIn('"NovaVoiceEngineTTS"', source)
        self.assertIn("configured?.properties?.[SAVED_SIZE_PROPERTY]", source)
        self.assertIn("configured?.size", source)
        self.assertIn("rememberSavedSize(this, minWidth, minHeight)", source)
        self.assertIn("scheduleSavedSizeRestore(this, savedSize)", source)
        self.assertIn("__novaSizeSerializationInstalled", source)
        self.assertIn("info.properties[SAVED_SIZE_PROPERTY]", source)
        self.assertIn("info.size = [...savedSize]", source)
        self.assertIn("node.setSize?.([...size])", source)

    def test_seed_lab_buttons_queue_random_and_fixed_runs_without_forcing_size(self) -> None:
        source = (ROOT / "web/nova_core_nodes.js").read_text(encoding="utf-8")
        seed_block = source[
            source.index("function installSeedLab(node)"):
            source.index("function timerSetting")
        ]
        for marker in (
            "Manual Random Seed",
            "Fixed Seed Run",
            "queueSeedWorkflow",
            "app.graphToPrompt()",
            "api.queuePrompt(0, prompt)",
            'runSeedQueueHooks("beforeQueued")',
            'runSeedQueueHooks("afterQueued")',
        ):
            self.assertIn(marker, source)
        self.assertNotIn("setSize", seed_block)

    def test_compare_guide_and_line_opacity_update_without_resize_reset(self) -> None:
        source = (ROOT / "web/nova_image_compare.js").read_text(encoding="utf-8")
        state_source = (ROOT / "web/nova_compare_state.js").read_text(encoding="utf-8")
        media_source = (ROOT / "web/nova_voice_prompt.js").read_text(encoding="utf-8")
        self.assertIn("compareGuideRenderState(state, includeGuide)", source)
        self.assertIn("split && includeGuide && guide", state_source)
        self.assertIn(
            "if (guideVisibility.drawDivider || guideVisibility.drawHandle)",
            source,
        )
        self.assertIn(
            'guideLine.style.display = guideVisibility.drawDivider ? "block" : "none"',
            source,
        )
        self.assertIn(
            'guideHandle.style.display = guideVisibility.drawHandle ? "flex" : "none"',
            source,
        )
        self.assertIn('guideHit.style.display = "block"', source)
        self.assertIn('compareDivider.style.display = "block"', media_source)
        self.assertIn(
            'compareHandle.style.display = state.showGuide ? "block" : "none"',
            media_source,
        )
        configure_block = source[
            source.index("const originalConfigure = nodeType.prototype.onConfigure"):
            source.index("const originalExecuted = nodeType.prototype.onExecuted")
        ]
        self.assertNotIn("setSize", configure_block)
        self.assertIn(
            "requestAnimationFrame(() => this.__novaCompareUI?.refresh?.())",
            source,
        )

    def test_old_workflow_titles_are_repaired_without_touching_prompt_widgets(self) -> None:
        source = (ROOT / "web/nova_workflow_text_repair.js").read_text(encoding="utf-8")
        for marker in (
            "repairVisibleTitle",
            "repairNodeTitle",
            "repairGraphTitles",
            "graph._groups",
            "node.title = repaired",
            "group.title = repaired",
            "loadedGraphNode(node)",
            "afterConfigureGraph()",
        ):
            self.assertIn(marker, source)
        self.assertNotIn("widgets_values", source)
        self.assertNotIn("widget.value", source)

    def test_compare_node_surface_uses_selected_theme_without_serializing_colours(self) -> None:
        source = (ROOT / "web/nova_image_compare.js").read_text(encoding="utf-8")
        self.assertIn("nodeType.prototype.onDrawBackground", source)
        self.assertIn("ctx.fillStyle = theme.panel", source)
        for assignment in ("node.color =", "node.bgcolor =", "node.boxcolor ="):
            self.assertNotIn(assignment, source)


if __name__ == "__main__":
    unittest.main()
