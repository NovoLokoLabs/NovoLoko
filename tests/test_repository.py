from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class RepositoryTests(unittest.TestCase):
    def test_manifest_brand_and_package(self) -> None:
        manifest = json.loads((ROOT / "NovoLoko_v4.0.0_manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["brand"], "NovoLoko")
        self.assertEqual(manifest["package"], "ComfyUI-NovoLoko")
        self.assertEqual(manifest["registered_node_count"], len(manifest["registered_nodes"]))
        self.assertEqual(
            manifest["style_libraries"]["csv_yaml_file_count"],
            sum(1 for folder in ("csv", "styles") for path in (ROOT / folder).rglob("*")
                if path.is_file() and path.suffix.lower() in {".csv", ".yaml", ".yml"}),
        )
        self.assertEqual(len(manifest["registered_nodes"]), len(set(manifest["registered_nodes"])))
        self.assertEqual(498, manifest["timer_sounds"]["playable_file_count"])
        self.assertEqual("data/NovoLokoTimerSounds", manifest["timer_sounds"]["path"])

    def test_required_project_files_exist(self) -> None:
        required = [
            "__init__.py",
            "README.md",
            "LICENSE",
            "AGENTS.md",
            "CODEX_START_HERE.md",
            "nodes.py",
            "aio_prompt_stack.py",
            "nova_core_nodes.py",
            "nova_workflow.py",
            "nova_compare.py",
            "voice_nodes.py",
            "unified_voice_node.py",
            "style_previews.py",
            "STYLE_PREVIEWS.md",
            "POPULATE_STYLE_PREVIEWS.bat",
            "tools/populate_style_previews.py",
            "tools/validate_project.py",
        ]
        for relative in required:
            with self.subTest(path=relative):
                self.assertTrue((ROOT / relative).is_file())

    def test_limited_use_license_is_present_and_proprietary(self) -> None:
        license_text = (ROOT / "LICENSE").read_text(encoding="utf-8")
        self.assertIn("NovoLoko Limited Use Licence", license_text)
        self.assertIn("Copyright (c) 2026 NovoLokoLabs", license_text)
        self.assertIn("Source visibility does not make NovoLoko open source.", license_text)
        for identifier in (
            "MIT License",
            "Apache License",
            "GNU General Public License",
            "BSD License",
            "Mozilla Public License",
            "Open Source Initiative Approved",
        ):
            with self.subTest(identifier=identifier):
                self.assertNotIn(identifier, license_text)

    def test_runtime_history_is_absent_or_empty(self) -> None:
        history_path = ROOT / "data/history.json"
        if not history_path.exists():
            return
        history = json.loads(history_path.read_text(encoding="utf-8"))
        self.assertIn(history, ({}, [], None))

    def test_workflow_names_are_novoloko_branded(self) -> None:
        workflows = list((ROOT / "workflows").glob("*.json"))
        self.assertGreaterEqual(len(workflows), 2)
        for workflow in workflows:
            with self.subTest(workflow=workflow.name):
                self.assertIn("NovoLoko", workflow.name)
                json.loads(workflow.read_text(encoding="utf-8"))

    def test_timer_sound_pack_is_release_owned_and_playable(self) -> None:
        sounds = ROOT / "data/NovoLokoTimerSounds"
        self.assertTrue(sounds.is_dir())
        audio = [
            path for path in sounds.rglob("*")
            if path.is_file() and path.suffix.lower() in {".wav", ".mp3"}
        ]
        self.assertEqual(498, len(audio))
        self.assertTrue((sounds / "README - Install and Folder Map.txt").is_file())
        source = (ROOT / "nova_core_nodes.py").read_text(encoding="utf-8")
        self.assertIn('"data", "NovoLokoTimerSounds"', source)
        self.assertNotIn("get_input_directory()", source[source.index("def _nova_timer_sound_dir"):source.index("def _safe_timer_sound_filename")])

    def test_v400_workflow_has_expected_shape_and_valid_runtime_state(self) -> None:
        path = ROOT / "workflows/NovoLoko AIO v4.0.0.json"
        text = path.read_text(encoding="utf-8")
        workflow = json.loads(text)
        self.assertEqual(39, len(workflow["nodes"]))
        self.assertEqual(60, len(workflow["links"]))
        compare = next(
            node for node in workflow["nodes"]
            if node["type"] == "NovaImageComparePro"
        )
        timer = next(
            node for node in workflow["nodes"]
            if node["type"] == "NovaGenerationTimer"
        )
        seed = next(
            node for node in workflow["nodes"]
            if node["type"] == "NovaSeedLab"
        )
        self.assertIsInstance(compare["properties"].get("novaCompareImageRefs", []), list)
        self.assertLessEqual(len(timer["properties"].get("novaTimerHistory", [])), 20)
        self.assertLessEqual(len(seed["properties"].get("novaSeedHistory", [])), 20)


if __name__ == "__main__":
    unittest.main()
