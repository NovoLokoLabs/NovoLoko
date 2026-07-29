from __future__ import annotations

import importlib
import importlib.util
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]


def load_script(name: str, relative_path: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def load_package_module(name: str):
    package = sys.modules.get("novoloko_test")
    if package is None:
        package = types.ModuleType("novoloko_test")
        package.__path__ = [str(ROOT)]
        sys.modules["novoloko_test"] = package
    return importlib.import_module(f"novoloko_test.{name}")


class HighConfidenceFixTests(unittest.TestCase):
    def test_migration_preserves_user_prompts(self) -> None:
        migration = load_script(
            "novoloko_migration_test",
            "tools/migrate_workflow_to_novoloko.py",
        )
        workflow = {
            "nodes": [
                {
                    "type": "NovaPromptStyleSwitchV3",
                    "title": "Nova Prompt Style",
                    "widgets_values": [
                        "Nova Scotia at night",
                        "A NOVA explosion",
                        "csv/actions/nova_actions_1000.csv",
                    ],
                    "properties": {
                        "cnr_id": "ComfyUI-NovaNodes",
                        "Node name for S&R": "NovaPromptStyleSwitchV3",
                    },
                }
            ]
        }

        migrated = migration.update(workflow)
        node = migrated["nodes"][0]
        self.assertEqual(node["type"], "NovaPromptStyleSwitch")
        self.assertEqual(node["title"], "NovoLoko Prompt Style")
        self.assertEqual(node["widgets_values"][0], "Nova Scotia at night")
        self.assertEqual(node["widgets_values"][1], "A NOVA explosion")
        self.assertEqual(
            node["widgets_values"][2],
            "csv/actions/novoloko_actions_1500.csv",
        )
        self.assertEqual(node["properties"]["cnr_id"], "ComfyUI-NovoLoko")
        self.assertEqual(
            node["properties"]["Node name for S&R"],
            "NovaPromptStyleSwitch",
        )

    def test_migration_repairs_repeated_utf8_mojibake_without_rewriting_normal_text(self) -> None:
        migration = load_script(
            "novoloko_migration_mojibake_test",
            "tools/migrate_workflow_to_novoloko.py",
        )
        damaged = "PASS 2 Ã¢â‚¬â€ UPSCALE Ã¢â‚¬Â¢ READY"
        self.assertEqual(
            "PASS 2 — UPSCALE • READY",
            migration.repair_mojibake_text(damaged),
        )
        self.assertEqual(
            "Nova Scotia — unchanged",
            migration.repair_mojibake_text("Nova Scotia — unchanged"),
        )

    def test_migration_maps_replaced_medium_library_without_touching_prompts(self) -> None:
        migration = load_script(
            "novoloko_migration_medium_library_test",
            "tools/migrate_workflow_to_novoloko.py",
        )
        workflow = {
            "nodes": [{
                "type": "NovaPromptStackAIO",
                "title": "Prompt Stack",
                "widgets_values": [
                    "styles/more examples/Pixaroma.yaml",
                    "Paint a Pixaroma theatre sign",
                ],
            }],
        }
        migrated = migration.update(workflow)
        self.assertEqual(
            "styles/more examples/Mediums.yaml",
            migrated["nodes"][0]["widgets_values"][0],
        )
        self.assertEqual(
            "Paint a Pixaroma theatre sign",
            migrated["nodes"][0]["widgets_values"][1],
        )

    def test_migration_removes_compare_only_serialized_theme_colours(self) -> None:
        migration = load_script(
            "novoloko_migration_compare_theme_test",
            "tools/migrate_workflow_to_novoloko.py",
        )
        workflow = {
            "nodes": [
                {
                    "type": "NovaImageComparePro",
                    "color": "#24415f",
                    "bgcolor": "#315f8f",
                    "boxcolor": "#123456",
                },
                {
                    "type": "NovaSeedLab",
                    "color": "#00ff00",
                    "bgcolor": "#003300",
                },
            ]
        }
        migrated = migration.update(workflow)
        compare, seed = migrated["nodes"]
        self.assertNotIn("color", compare)
        self.assertNotIn("bgcolor", compare)
        self.assertNotIn("boxcolor", compare)
        self.assertEqual("#00ff00", seed["color"])
        self.assertEqual("#003300", seed["bgcolor"])

    def test_release_cleanup_removes_only_personal_runtime_state(self) -> None:
        migration = load_script(
            "novoloko_release_runtime_cleanup_test",
            "tools/migrate_workflow_to_novoloko.py",
        )
        workflow = {
            "nodes": [
                {
                    "type": "NovaImageComparePro",
                    "properties": {
                        "novaCompareTheme": "Charcoal",
                        "novaCompareImageRefs": [{"filename": "temp.png"}],
                        "novaCompareInfo": {"label_a": "private"},
                    },
                },
                {
                    "type": "NovaGenerationTimer",
                    "properties": {
                        "novaTimerHistory": [1000, 2000],
                        "novaTimerLastMs": 2000,
                        "novaTimerOutcome": "DONE",
                        "novaTimer_sound": "Custom: 01 Timer/done.mp3",
                    },
                },
                {
                    "type": "NovaSeedLab",
                    "properties": {
                        "novaLastSeed": "123",
                        "novaSeedHistory": ["123"],
                        "novaSelectedSeed": "123",
                        "novaSeedHistoryMenu": "floating dark menu v3.2.6",
                    },
                },
                {
                    "type": "NovaVoiceEngineTTS",
                    "properties": {"engine": "OmniLoko"},
                    "widgets_values": ["text", "OmniLoko", True, "Private preset"],
                },
            ]
        }
        cleaned = migration.clean_release_runtime_state(workflow)
        compare, timer, seed, voice = cleaned["nodes"]
        compare = compare["properties"]
        timer = timer["properties"]
        seed = seed["properties"]
        self.assertEqual({"novaCompareTheme": "Charcoal"}, compare)
        self.assertEqual({"novaTimer_sound": "Custom: 01 Timer/done.mp3"}, timer)
        self.assertEqual(
            {"novaSeedHistoryMenu": "floating dark menu v3.2.6"},
            seed,
        )
        self.assertEqual(
            "Current OmniLoko Profile",
            voice["widgets_values"][3],
        )

    def test_javascript_validator_uses_es_module_mode(self) -> None:
        validator = load_script(
            "novoloko_validator_test",
            "tools/validate_project.py",
        )
        source = 'import { app } from "../../scripts/app.js";\nexport { app };\n'
        with tempfile.TemporaryDirectory() as directory:
            script = Path(directory) / "module.js"
            script.write_text(source, encoding="utf-8")
            result = validator.Result(errors=[], warnings=[])
            completed = subprocess.CompletedProcess([], 0, "", "")
            with (
                mock.patch.object(validator, "JAVASCRIPT_FILES", [script]),
                mock.patch.object(validator.shutil, "which", return_value="node"),
                mock.patch.object(
                    validator.subprocess,
                    "run",
                    return_value=completed,
                ) as run,
            ):
                validator.validate_javascript(result)

        self.assertEqual(result.errors, [])
        command = run.call_args.args[0]
        self.assertEqual(command, ["node", "--input-type=module", "--check"])
        self.assertEqual(run.call_args.kwargs["input"], source)
        self.assertEqual(run.call_args.kwargs["encoding"], "utf-8")

    def test_empty_search_stays_empty(self) -> None:
        nodes = load_package_module("nodes")
        styles = [
            {
                "name": "Portrait",
                "prompt": "portrait lighting",
                "negative": "",
                "category": "Photo",
                "weight": 1.0,
                "favorite": False,
            }
        ]
        self.assertEqual(
            nodes._filter_styles(
                styles,
                "All",
                "definitely-not-present",
                False,
                "",
                saved_favorites=[],
            ),
            [],
        )

    def test_explicit_search_modes_return_no_style_when_empty(self) -> None:
        nodes = load_package_module("nodes")
        with tempfile.TemporaryDirectory() as directory:
            library = Path(directory) / "styles.csv"
            library.write_text(
                "name,prompt,negative_prompt,category,weight\n"
                "Portrait,portrait lighting,,Photo,1\n",
                encoding="utf-8",
            )
            for mode in ("Search Random", "Search First Match"):
                with self.subTest(mode=mode):
                    output = nodes.LoadStylesCSVPro().load_style(
                        csv_file_path=str(library),
                        mode=mode,
                        style="Portrait",
                        manual_style_name="",
                        category="All",
                        search="definitely-not-present",
                        seed=42,
                        use_weighted_random="true",
                        random_count="1",
                        delimiter=", ",
                        extra_positive="",
                        extra_negative="",
                        favorites_list="",
                        save_to_history=False,
                        use_saved_favorites=False,
                    )["result"]

                    self.assertEqual(output[0], "")
                    self.assertEqual(output[1], "")
                    self.assertEqual(output[2], "No Style")
                    self.assertIn("Pool: 0 styles", output[3])

    def test_prompt_styler_random_invalidates_cache(self) -> None:
        workflow = load_package_module("nova_workflow")
        with mock.patch.object(workflow.time, "time_ns", return_value=123456):
            self.assertEqual(
                workflow.NovaPromptStyler.IS_CHANGED(template_name="random"),
                123456,
            )
        stable = workflow.NovaPromptStyler.IS_CHANGED(template_name="none")
        self.assertIsInstance(stable, tuple)
        self.assertEqual(stable[3], "none")

    def test_prompt_styler_lists_csv_and_yaml_libraries(self) -> None:
        workflow = load_package_module("nova_workflow")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "styles").mkdir()
            (root / "csv/styles").mkdir(parents=True)
            (root / "styles/camera.yaml").write_text("styles: []\n", encoding="utf-8")
            (root / "csv/styles/portraits.csv").write_text(
                "name,prompt,negative_prompt\nPortrait,cinematic {prompt},blurry\n",
                encoding="utf-8",
            )
            with mock.patch.object(workflow, "_node_dir", return_value=str(root)):
                files = workflow._style_files()

        self.assertEqual("styles/camera.yaml", files[0])
        self.assertIn("csv/styles/portraits.csv", files)


if __name__ == "__main__":
    unittest.main()
