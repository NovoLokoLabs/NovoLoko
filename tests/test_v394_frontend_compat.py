from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class DualFrontendCompatibilityTests(unittest.TestCase):
    def source(self, name: str) -> str:
        return (ROOT / "web" / name).read_text(encoding="utf-8")

    def test_compare_has_independent_surface_properties_and_one_time_migration(self) -> None:
        source = self.source("nova_image_compare.js")
        state_source = self.source("nova_compare_state.js")
        self.assertIn("novaCompareFullscreenGuide", source)
        self.assertIn("novaCompareFullscreenLineOpacity", source)
        self.assertIn("state.surface,", source)
        self.assertIn("const latest = fullscreenState(node)", source)
        self.assertIn("fullscreenGuide", state_source)
        self.assertIn("fullscreenLineOpacity", state_source)
        self.assertIn("sourceProperties.novaCompareFullscreenGuide == null", state_source)
        self.assertIn("persistCompareSurfaceGuide", source)

    def test_compare_legacy_widget_mount_is_repaired_without_duplicates(self) -> None:
        source = self.source("nova_image_compare.js")
        self.assertIn("node.__novaCompareUI?.root?.isConnected", source)
        self.assertIn("stale?.onRemove?.()", source)
        self.assertIn('setProperty("pointer-events", "auto", "important")', source)
        self.assertIn("resizeObserver.disconnect()", source)

    def test_manual_size_persistence_covers_both_resize_engines(self) -> None:
        source = self.source("nova_compact_nodes.js")
        for marker in (
            "app.canvas?.resizing_node === node",
            "__novaVueResizeActive",
            "target?.closest?.('[role=\"button\"]')",
            "/resize/i.test(handleText)",
            "host.contains(element)",
            "nearHorizontalEdge && nearVerticalEdge",
            "__novaVuePointerDown",
            "__novaVueInteractionSeen",
            "__novaReadVueStyleSize",
            "Fallback for frontend builds",
            'getPropertyValue("--node-width")',
            'getPropertyValue("--node-height")',
            "node.setSize?.([...size])",
            "novaSavedManualSize",
            "info.size = [...savedSize]",
            "scheduleSavedSizeRestore",
            "node.__novaRestoringSavedSize",
            "sameSize(candidate, saved)",
            "ArrayBuffer.isView(value)",
        ):
            self.assertIn(marker, source)
        self.assertRegex(source, r"for \(const delay of \[0, 50, 250, 750\]\)")

    def test_notes_keep_original_widget_serialization_and_single_editor(self) -> None:
        source = self.source("nova_compact_nodes.js")
        state_source = self.source("nova_note_state.js")
        block = source[
            source.index("function installNoteCompatibility"):
            source.index("app.registerExtension")
        ]
        self.assertIn("__novaNoteCompatibilityInstalled", block)
        self.assertIn('sourceWidget.value = value', block)
        self.assertIn("info.properties.text = editor.value", block)
        self.assertIn('"copy", "cut", "paste"', block)
        self.assertIn("event.stopPropagation()", block)
        self.assertIn('"reuse-native"', block)
        self.assertIn("scheduleNoteCompatibility", block)
        self.assertIn("sourceWidget.hidden = false", block)
        self.assertIn('querySelector?.(`[data-node-id="${node?.id}"]`)', block)
        self.assertIn("delay >= 500", block)
        self.assertIn("hasSourceWidget", state_source)
        self.assertIn("hasNativeEditor", state_source)
        self.assertNotIn("node.widgets = []", block)

    def test_timer_has_nodes2_dom_controls_exact_once_and_cleanup(self) -> None:
        source = self.source("nova_core_nodes.js")
        self.assertIn("showTimerSettings(node)", source)
        self.assertIn("nova-timer-nodes2-legacy-v398", source)
        self.assertIn("nova-timer-host-v397", source)
        self.assertIn("if (timerCompletionHandled) return", source)
        self.assertIn("if (node.__novaCountdownState === \"DONE\") return", source)
        self.assertIn("stopCountdownInterval(this)", source)
        self.assertIn("uninstallTimerEventsIfUnused()", source)
        self.assertIn("api.removeEventListener", source)

    def test_style_numbers_are_global_and_large_counter_uses_filtered_total(self) -> None:
        source = self.source("nova_style_dropdown.js")
        self.assertIn("nova-style-preview-number", source)
        self.assertIn("(page - 1) * pageSize + localIndex + 1", source)
        self.assertIn("nova-style-preview-viewer-counter", source)
        self.assertIn("data.filtered_count || items.length", source)
        self.assertIn("updateViewerCounter()", source)
        self.assertGreaterEqual(len(re.findall(r"updateViewerCounter\(\)", source)), 3)


if __name__ == "__main__":
    unittest.main()
