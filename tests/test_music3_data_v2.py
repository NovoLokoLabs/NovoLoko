from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = "novoloko_music_data_v2_testpkg"


def load_modules():
    package = types.ModuleType(PACKAGE)
    package.__path__ = [str(ROOT)]
    sys.modules[PACKAGE] = package

    music_spec = importlib.util.spec_from_file_location(
        f"{PACKAGE}.music3_nodes", ROOT / "music3_nodes.py"
    )
    music = importlib.util.module_from_spec(music_spec)
    assert music_spec and music_spec.loader
    sys.modules[music_spec.name] = music
    music_spec.loader.exec_module(music)

    patch_spec = importlib.util.spec_from_file_location(
        f"{PACKAGE}.music3_data_v2", ROOT / "music3_data_v2.py"
    )
    patch = importlib.util.module_from_spec(patch_spec)
    assert patch_spec and patch_spec.loader
    sys.modules[patch_spec.name] = patch
    patch_spec.loader.exec_module(patch)

    rules_spec = importlib.util.spec_from_file_location(
        f"{PACKAGE}.music3_data_v2_rules", ROOT / "music3_data_v2_rules.py"
    )
    rules = importlib.util.module_from_spec(rules_spec)
    assert rules_spec and rules_spec.loader
    sys.modules[rules_spec.name] = rules
    rules_spec.loader.exec_module(rules)
    return music, patch


music3, data_v2 = load_modules()


class MusicDataV2Tests(unittest.TestCase):
    def test_legacy_genres_collapse_to_broad_parents(self):
        cases = {
            "K-Pop": "Pop",
            "Girl Group Pop": "Pop",
            "Grunge": "Rock",
            "Britpop": "Rock",
            "Metalcore": "Metal",
            "Boom Bap": "Hip-Hop / Rap",
            "Drill": "Hip-Hop / Rap",
            "Techno": "Electronic",
            "House": "Electronic",
            "Amapiano": "Afrobeat / Afropop",
            "Alt-Country": "Country",
        }
        for source, expected in cases.items():
            with self.subTest(source=source):
                self.assertEqual(expected, data_v2.broad_genre_for(source))

    def test_major_genres_have_real_style_depth(self):
        counts = {}
        parents = data_v2._style_parent_map()
        for parent in data_v2.BROAD_GENRES:
            counts[parent] = sum(1 for value in parents.values() if value == parent)
        minimums = {
            "Pop": 20,
            "Rock": 20,
            "Metal": 14,
            "Hip-Hop / Rap": 14,
            "Electronic": 24,
            "R&B / Soul": 8,
            "Reggae / Dancehall": 6,
            "Country": 6,
            "Jazz": 8,
        }
        for parent, minimum in minimums.items():
            with self.subTest(parent=parent):
                self.assertGreaterEqual(counts[parent], minimum)

    def test_obvious_pop_styles_live_under_pop(self):
        parents = data_v2._style_parent_map()
        for style in ("K-Pop", "K-Pop Girl Group", "J-Pop", "City Pop", "Dance Pop", "Dark Pop", "Girl Group Pop"):
            with self.subTest(style=style):
                self.assertEqual("Pop", parents[style])

    def test_generic_preset_repairs_remove_obvious_mismatches(self):
        presets = music3._load_builtin_music_presets()
        bright = presets["Bright Radio Pop"]
        self.assertEqual("Club Synths and Percussion", bright["instruments"])
        self.assertEqual("Verse-Pre-Chorus-Chorus Pop", bright["song_structure"])
        self.assertEqual("Instant Title Earworm", bright["hook_style"])

        alt = presets["Alternative Rock Catharsis"]
        self.assertEqual("Electric Guitar + Bass + Live Drums", alt["instruments"])
        self.assertEqual("Quiet-Loud Alternative Arc", alt["song_structure"])

        metal = presets["Classic Heavy Metal"]
        self.assertEqual("Two Electric Guitars + Bass + Arena Drums", metal["instruments"])
        self.assertEqual("Intro-Riff-Verse-Chorus-Solo", metal["song_structure"])
        self.assertEqual("Clean Metal Anthem Chorus", metal["hook_style"])

    def test_reference_dna_uses_explicit_or_curated_traits_not_generic_base_baggage(self):
        presets = music3.load_music_presets()
        missy = presets["Missy Elliott — Clone"]
        self.assertEqual("curated Music Data v2", missy["__dna_source"])
        scene = missy["__dna_traits"]["scene"].casefold()
        self.assertIn("futuristic hip-hop", scene)
        self.assertNotIn("90s east coast boom bap", scene)
        self.assertNotIn("drum programming", scene)
        self.assertIn("unconventional drum programming", missy["__dna_traits"]["instruments"].casefold())

        resolved, effective, randomized, _seed = music3.NovaMusicControls.resolve_selections(
            preset="Missy Elliott — Clone", randomize_all=False, seed=1234
        )
        self.assertEqual("Missy Elliott — Clone", effective)
        self.assertFalse(randomized)
        dna, locked, _influenced = music3._reference_dna(resolved, "Clone", set())
        self.assertIn("unconventional drum programming", dna.casefold())
        self.assertIn("mix and production character", locked)
        self.assertNotIn("missy elliott", dna.casefold())

    def test_manual_override_removes_only_matching_reference_trait(self):
        resolved, _effective, _randomized, _seed = music3.NovaMusicControls.resolve_selections(
            preset="Missy Elliott — Clone", randomize_all=False, seed=4321
        )
        dna, locked, _influenced = music3._reference_dna(resolved, "Clone", {"instruments"})
        self.assertNotIn("unconventional drum programming", dna.casefold())
        self.assertIn("futuristic dry-and-punchy mix", dna.casefold())
        self.assertNotIn("instrument, drum, bass, guitar and synth identity", locked)
        self.assertIn("mix and production character", locked)

    def test_guided_random_uses_coherent_preset_skeleton_and_is_seed_stable(self):
        first = music3.NovaMusicControls.resolve_selections(
            preset=music3.RANDOM_PRESET,
            randomize_all=True,
            seed=991827,
        )
        second = music3.NovaMusicControls.resolve_selections(
            preset=music3.RANDOM_PRESET,
            randomize_all=True,
            seed=991827,
        )
        resolved, effective, randomized, seed = first
        self.assertTrue(randomized)
        self.assertEqual(991827, seed)
        self.assertEqual(effective, second[1])
        self.assertEqual(
            {key: row["name"] for key, row in resolved.items()},
            {key: row["name"] for key, row in second[0].items()},
        )
        skeleton = music3.load_music_presets()[effective]
        for key in ("genre", "subgenre_era", "vocal_delivery", "vocal_gender_type", "instruments", "production_style", "bpm_tempo", "song_structure", "hook_style", "mood", "aggression", "darkness"):
            with self.subTest(key=key):
                self.assertEqual(skeleton[key], resolved[key]["name"])
        self.assertTrue(all(row.get("_choice") == music3.RANDOM_OPTION for row in resolved.values()))

    def test_random_style_respects_selected_parent_genre(self):
        resolved, _effective, _randomized, _seed = music3.NovaMusicControls.resolve_selections(
            preset=music3.CUSTOM_PRESET,
            randomize_all=False,
            seed=123456,
            genre="Pop",
            subgenre_era=music3.RANDOM_OPTION,
        )
        parent = data_v2._style_parent_map()[resolved["subgenre_era"]["name"]]
        self.assertEqual("Pop", parent)
        self.assertTrue(resolved["subgenre_era"].get("_report", "").startswith("Random ->"))

    def test_api_exposes_broad_genres_and_artist_pairs_are_adjacent(self):
        payload = music3._music_controls_api_payload()
        genre = next(item for item in payload["categories"] if item["key"] == "genre")
        values = [item["value"] for item in genre["options"]]
        self.assertIn("Pop", values)
        self.assertIn("Rock", values)
        self.assertNotIn("K-Pop", values)
        self.assertNotIn("Grunge", values)
        self.assertEqual("2", payload["music_data_version"])

        visible = [row for row in payload["presets"] if not row["hidden"]]
        for reference in ("Måneskin", "Counting Crows", "Missy Elliott", "Pearl Jam"):
            indexes = [
                index for index, row in enumerate(visible)
                if row.get("reference") == reference and row.get("reference_mode") in {"Clone", "Like"}
            ]
            with self.subTest(reference=reference):
                self.assertEqual(2, len(indexes))
                self.assertEqual(1, indexes[1] - indexes[0])
                self.assertEqual("Clone", visible[indexes[0]]["reference_mode"])
                self.assertEqual("Like", visible[indexes[1]]["reference_mode"])


if __name__ == "__main__":
    unittest.main()
