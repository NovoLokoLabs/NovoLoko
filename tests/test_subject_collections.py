from __future__ import annotations

import csv
import importlib
import json
import sys
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = "novoloko_subject_tests"
COLLECTIONS = {
    "csv/subjects/novoloko_animals_600.csv": 600,
    "csv/subjects/novoloko_real_cars_600.csv": 600,
    "csv/subjects/novoloko_fantasy_500.csv": 500,
    "csv/subjects/novoloko_horror_500.csv": 500,
    "csv/subjects/novoloko_subjects_master_2200.csv": 2200,
    "csv/actions/novoloko_automotive_actions_400.csv": 400,
    "csv/actions/novoloko_animal_actions_250.csv": 250,
    "csv/actions/novoloko_fantasy_horror_actions_350.csv": 350,
    "csv/locations/novoloko_locations_variety_1500.csv": 1500,
}
LEGACY_REQUIRED = [
    "all_slots_enabled",
    "medium_file_path", "medium_category", "medium_search", "medium_selection",
    "pose_file_path", "pose_category", "pose_search", "pose_selection",
    "action_file_path", "action_category", "action_search", "action_selection",
    "clothing_file_path", "clothing_category", "clothing_search", "clothing_selection",
    "location_file_path", "location_category", "location_search", "location_selection",
    "character_file_path", "character_category", "character_search", "character_selection",
    "random_mode", "seed", "delimiter", "manual_prompt", "extra_positive", "extra_negative",
]
SUBJECT_REQUIRED = [
    "subject_file_path", "subject_category", "subject_search", "subject_selection",
]
LEGACY_OUTPUTS = (
    "combined_prompt",
    "combined_negative",
    "selected_summary",
    "medium_name",
    "pose_name",
    "action_name",
    "clothing_name",
    "location_name",
    "character_name",
)


def load_aio():
    package = sys.modules.get(PACKAGE)
    if package is None:
        package = types.ModuleType(PACKAGE)
        package.__path__ = [str(ROOT)]
        sys.modules[PACKAGE] = package
    return importlib.import_module(f"{PACKAGE}.aio_prompt_stack")


def read_rows(relative: str):
    with (ROOT / relative).open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


class SubjectCollectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.aio = load_aio()

    def test_collection_schema_counts_controls_and_uniqueness(self) -> None:
        for relative, expected in COLLECTIONS.items():
            with self.subTest(collection=relative):
                rows = read_rows(relative)
                self.assertEqual(expected, len(rows))
                self.assertEqual(["name", "category", "prompt", "negative_prompt"], list(rows[0]))
                self.assertEqual("none", rows[0]["name"])
                self.assertEqual("random", rows[1]["name"])
                content = rows[2:]
                self.assertEqual(len(content), len({row["name"] for row in content}))
                self.assertEqual(len(content), len({row["prompt"] for row in content}))
                self.assertTrue(all(row["category"].strip() for row in content))
                self.assertTrue(all(row["prompt"].strip() for row in content))
                self.assertTrue(all(row["negative_prompt"].strip() for row in content))

    def test_master_contains_every_subject_collection_prompt(self) -> None:
        master = {row["prompt"] for row in read_rows("csv/subjects/novoloko_subjects_master_2200.csv")}
        for relative in (
            "csv/subjects/novoloko_animals_600.csv",
            "csv/subjects/novoloko_real_cars_600.csv",
            "csv/subjects/novoloko_fantasy_500.csv",
            "csv/subjects/novoloko_horror_500.csv",
        ):
            with self.subTest(collection=relative):
                prompts = {row["prompt"] for row in read_rows(relative)[2:]}
                self.assertTrue(prompts.issubset(master))

    def test_required_car_models_are_present(self) -> None:
        text = "\n".join(row["name"] for row in read_rows("csv/subjects/novoloko_real_cars_600.csv"))
        required = (
            "Nissan Skyline GT-R R32", "Nissan Skyline GT-R R33", "Nissan Skyline GT-R R34",
            "Nissan GT-R R35", "Toyota Supra A40", "Toyota Supra A60", "Toyota Supra A70",
            "Toyota Supra A80", "Toyota GR Supra A90", "Mazda RX-7 SA22C", "Mazda RX-7 FC3S",
            "Mazda RX-7 FD3S", "Honda NSX NA1", "Honda NSX NA2", "Honda NSX NC1",
            "Mitsubishi Lancer Evolution I", "Mitsubishi Lancer Evolution X",
            "Subaru Impreza WRX STI GC8", "Ferrari 288 GTO", "Ferrari F40", "Ferrari F50",
            "Ferrari Testarossa", "Ferrari Enzo", "Ferrari 458 Italia", "Ferrari 488 Pista",
            "Ferrari F8 Tributo", "Ferrari 812 Superfast", "Ferrari SF90 Stradale",
            "Ferrari 296 GTB", "Ferrari LaFerrari", "Ferrari Daytona SP3", "Porsche 911 930",
            "Porsche 911 964", "Porsche 911 993", "Porsche 911 996", "Porsche 911 997",
            "Porsche 911 991", "Porsche 911 992", "Porsche Carrera GT", "Porsche 918 Spyder",
            "Porsche Cayman GT4 RS", "Porsche 944 Turbo", "Porsche 928 GTS",
        )
        for model in required:
            with self.subTest(model=model):
                self.assertIn(model, text)

    def test_required_subject_and_location_categories_are_present(self) -> None:
        animal_categories = {row["category"] for row in read_rows("csv/subjects/novoloko_animals_600.csv")}
        self.assertTrue({
            "African wildlife", "Big cats", "Wild canines", "Bears", "Primates",
            "Hoofed animals", "Australian wildlife", "Farm animals", "Domestic pets",
            "Birds", "Birds of prey", "Reptiles", "Amphibians", "Marine mammals",
            "Sharks and rays", "Fish", "Insects", "Arachnids", "Prehistoric animals",
        }.issubset(animal_categories))
        fantasy_categories = {row["category"] for row in read_rows("csv/subjects/novoloko_fantasy_500.csv")}
        self.assertTrue({"Dragons", "Fae", "Merfolk", "Enchanted armour", "Fantasy vehicles"}.issubset(fantasy_categories))
        horror_categories = {row["category"] for row in read_rows("csv/subjects/novoloko_horror_500.csv")}
        self.assertTrue({"Gothic creatures", "Haunted dolls", "Cosmic horror", "Analog horror", "Body horror"}.issubset(horror_categories))
        location_categories = {row["category"] for row in read_rows("csv/locations/novoloko_locations_variety_1500.csv")}
        self.assertTrue({
            "African savanna", "Australian outback", "Coral reefs", "Deep-sea trenches",
            "McDonald's interiors", "McDonald's drive-through", "Fantasy castles",
            "Enchanted forests", "Haunted hospitals", "Underground laboratories",
            "Foggy graveyards", "Cosmic environments",
        }.issubset(location_categories))
        automotive = read_rows("csv/actions/novoloko_automotive_actions_400.csv")
        automotive_categories = {row["category"] for row in automotive}
        self.assertTrue({
            "Parked Display", "Highway Rolling", "Circuit Racing", "Rally Driving",
            "Drifting", "Burnout", "Drag Launch", "Pit Lane", "Petrol Station",
            "Car Meet", "Bonnet Interaction", "Under Bonnet", "Refuelling",
            "Cockpit Driving", "Roadside Breakdown", "Police Pursuit",
            "Cinematic Arrival", "Cinematic Departure",
        }.issubset(automotive_categories))
        self.assertTrue(any(
            row["category"] == "Bonnet Interaction" and "sitting on the bonnet" in row["prompt"].lower()
            for row in automotive
        ))

    def test_v330_widget_and_output_order_is_unchanged_then_appended(self) -> None:
        required = list(self.aio.NovaPromptStackAIOV3.INPUT_TYPES()["required"])
        self.assertEqual(LEGACY_REQUIRED, required[:len(LEGACY_REQUIRED)])
        self.assertEqual(SUBJECT_REQUIRED, required[len(LEGACY_REQUIRED):])
        self.assertEqual(LEGACY_OUTPUTS, self.aio.NovaPromptStackAIOV3.RETURN_NAMES[:9])
        self.assertEqual("subject_name", self.aio.NovaPromptStackAIOV3.RETURN_NAMES[9])

        legacy_v330_values = [
            True,
            "styles/novoloko_medium_styles_286.csv", "All", "", "random",
            "csv/poses/novoloko_pose_collection_485.csv", "All", "", "none",
            "csv/actions/novoloko_actions_1000.csv", "All", "", "none",
            "csv/clothing/novoloko_clothing_hair_expanded_4000.csv", "All", "", "none",
            "csv/locations/novoloko_locations_expanded_3000.csv", "All", "", "none",
            "csv/characters/novoloko_characters_master_1098.csv", "All", "kpop", "none",
            "Random From Seed", 8, ", ", "", "", "",
        ]
        self.assertEqual(len(LEGACY_REQUIRED), len(legacy_v330_values))
        restored = dict(zip(required, legacy_v330_values))
        self.assertEqual("Random From Seed", restored["random_mode"])
        self.assertEqual(8, restored["seed"])
        self.assertEqual("kpop", restored["character_search"])
        self.assertNotIn("subject_file_path", restored)

    def test_subject_seed_search_summary_and_output_are_deterministic(self) -> None:
        required = self.aio.NovaPromptStackAIOV3.INPUT_TYPES()["required"]
        kwargs = {}
        for name, spec in required.items():
            settings = spec[1] if len(spec) > 1 and isinstance(spec[1], dict) else {}
            default = settings.get("default")
            if default is None:
                default = spec[0][0] if isinstance(spec[0], list) else ""
            kwargs[name] = default
        for slot in self.aio.LEGACY_SLOTS:
            kwargs[f"{slot}_selection"] = "none"
        kwargs.update(
            random_mode="Random From Seed",
            seed=74123,
            manual_prompt="portrait",
            subject_file_path="csv/subjects/novoloko_real_cars_600.csv",
            subject_category="Ferrari",
            subject_search="Ferrari F40",
            subject_selection="random",
        )
        first = self.aio.NovaPromptStackAIOV3().build(**kwargs)
        second = self.aio.NovaPromptStackAIOV3().build(**kwargs)
        self.assertEqual(first, second)
        self.assertIn("Ferrari F40", first[0])
        self.assertIn("Order: Medium > Subject > Pose > Action > Clothing > Location > Character > Manual Prompt", first[2])
        self.assertIn("Subject:", first[2])
        self.assertIn("Ferrari F40", first[9])

    def test_master_nested_categories_filter_despite_separator_spacing(self) -> None:
        records = self.aio._read_styles("csv/subjects/novoloko_subjects_master_2200.csv")
        cases = (
            ("Cars / Ferrari", "Ferrari F40"),
            ("Animals / African wildlife", "African elephant"),
            ("Fantasy / Dragons", "ancient mountain dragon"),
            ("Horror / Gothic creatures", "gargoyle sentinel"),
        )
        for category, search in cases:
            with self.subTest(category=category, search=search):
                matches = self.aio._filtered_records(records, category, search)
                self.assertGreater(len(matches), 0)

    def test_empty_subject_is_safe_and_legacy_seed_offsets_are_preserved(self) -> None:
        required = self.aio.NovaPromptStackAIOV3.INPUT_TYPES()["required"]
        kwargs = {}
        for name, spec in required.items():
            settings = spec[1] if len(spec) > 1 and isinstance(spec[1], dict) else {}
            default = settings.get("default")
            if default is None:
                default = spec[0][0] if isinstance(spec[0], list) else ""
            kwargs[name] = default
        for slot in self.aio.SLOTS:
            kwargs[f"{slot}_selection"] = "none"
        kwargs["subject_selection"] = ""
        result = self.aio.NovaPromptStackAIOV3().build(**kwargs)
        self.assertEqual("none", result[9])
        self.assertEqual(self.aio.SEED_SLOT_INDEX["pose"], 1)
        self.assertEqual(self.aio.SEED_SLOT_INDEX["character"], 5)
        self.assertEqual(self.aio.SEED_SLOT_INDEX["subject"], 6)

    def test_v350_workflow_uses_subject_and_one_unified_voice_node(self) -> None:
        path = ROOT / "workflows/NovoLoko AIO v3.5.0 - Latest Workflow.json"
        text = path.read_text(encoding="utf-8")
        workflow = json.loads(text)
        types = [node["type"] for node in workflow["nodes"]]
        self.assertEqual(1, types.count("NovaVoiceEngineTTS"))
        self.assertNotIn("NovaKokoroTTS", types)
        self.assertNotIn("NovaOmniLokoTTS", types)
        self.assertNotRegex(text, r"""(?i)(?:^|["'])\s*[a-z]:[\\/]""")
        prompt = next(node for node in workflow["nodes"] if node["type"] == "NovaPromptStackAIO")
        voice = next(node for node in workflow["nodes"] if node["type"] == "NovaVoiceEngineTTS")
        media = next(node for node in workflow["nodes"] if node["type"] == "NovaAudioHistoryPlayer")
        self.assertEqual(10, len(prompt["outputs"]))
        self.assertEqual("subject_name", prompt["outputs"][9]["name"])
        self.assertEqual("OmniLoko", voice["widgets_values"][1])
        self.assertEqual("Current OmniLoko Profile", voice["widgets_values"][3])
        serialized = prompt["widgets_values"]
        for index in (1, 5, 9, 13, 17, 21, 32):
            with self.subTest(collection=serialized[index]):
                self.assertTrue((ROOT / serialized[index]).is_file())
        self.assertEqual("", serialized[31])  # released extra_negative value
        self.assertEqual("none", serialized[35])
        audio_link = voice["outputs"][0]["links"][0]
        voice_link = voice["outputs"][3]["links"][0]
        self.assertEqual(audio_link, media["inputs"][0]["link"])
        self.assertEqual(voice_link, media["inputs"][2]["link"])
        link_ids = {link[0] for link in workflow["links"]}
        self.assertEqual(len(link_ids), len(workflow["links"]))

    def test_new_assets_contain_no_credentials_models_audio_or_private_paths(self) -> None:
        paths = [ROOT / relative for relative in COLLECTIONS]
        paths.extend((ROOT / "workflows").glob("*v3.5.0*.json"))
        forbidden = (
            "bearertoken",
            "deploy_key",
            "github_pat_",
            "private key",
            "m:" + "\\",
            "c:" + "\\" + "users" + "\\",
        )
        for path in paths:
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8", errors="ignore").lower()
                self.assertFalse(any(marker in text for marker in forbidden))
                self.assertNotIn(path.suffix.lower(), {".pt", ".pth", ".safetensors", ".wav", ".mp3"})


if __name__ == "__main__":
    unittest.main()
