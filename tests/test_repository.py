from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class RepositoryTests(unittest.TestCase):
    def test_manifest_brand_and_package(self) -> None:
        manifest = json.loads((ROOT / "NovoLoko_v3.3.0_manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["brand"], "NovoLoko")
        self.assertEqual(manifest["package"], "ComfyUI-NovoLoko")
        self.assertEqual(manifest["registered_node_count"], len(manifest["registered_nodes"]))
        self.assertEqual(len(manifest["registered_nodes"]), len(set(manifest["registered_nodes"])))

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


if __name__ == "__main__":
    unittest.main()
