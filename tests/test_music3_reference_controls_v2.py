from __future__ import annotations

import unittest

from test_music3_data_v2 import music3


class MusicReferenceControlsV2Tests(unittest.TestCase):
    def test_artist_presets_no_longer_display_hidden_generic_base_values(self):
        presets = music3.load_music_presets()
        for name, expected_genre in (
            ("Missy Elliott — Clone", "Hip-Hop / Rap"),
            ("Dua Lipa — Clone", "Pop"),
            ("Måneskin — Clone", "Rock"),
            ("Counting Crows — Like", "Rock"),
        ):
            with self.subTest(name=name):
                row = presets[name]
                self.assertEqual(expected_genre, row["genre"])
                self.assertEqual(music3.NONE_OPTION, row["subgenre_era"])
                self.assertEqual(music3.NONE_OPTION, row["vocal_delivery"])
                self.assertEqual(music3.NONE_OPTION, row["vocal_gender_type"])
                self.assertEqual(music3.NONE_OPTION, row["instruments"])
                self.assertEqual(music3.NONE_OPTION, row["production_style"])
                self.assertEqual(music3.NONE_OPTION, row["bpm_tempo"])
                self.assertEqual(music3.NONE_OPTION, row["song_structure"])
                self.assertEqual(music3.NONE_OPTION, row["hook_style"])
                self.assertTrue(row.get("__reference_controls_neutral"))

    def test_missy_transparency_no_longer_claims_boom_bap_controls_are_selected(self):
        result = music3.NovaMusicControls().build(
            preset="Missy Elliott — Clone",
            randomize_all=False,
            seed=424242,
            idea="a futuristic original club song",
        )
        report = result[3].casefold()
        self.assertIn("reference generation policy", report)
        self.assertIn("style / era: none / no preference", report)
        self.assertIn("band / instrument setup: none / no preference", report)
        self.assertNotIn("90s east coast boom bap", report)
        self.assertNotIn("dusty boom-bap mix", report)

    def test_preset_browser_explains_neutral_controls(self):
        payload = music3._music_controls_api_payload()
        row = next(item for item in payload["presets"] if item["name"] == "Missy Elliott — Clone")
        self.assertTrue(row.get("reference_controls_neutral"))
        self.assertIn("generic controls below start neutral", row["description"])
        self.assertEqual("Strong reference", row["reference_mode_label"])
        self.assertEqual("Missy Elliott — Strong reference", row["display_name"])
        self.assertEqual("Missy Elliott — Clone", row["name"])
        self.assertEqual("Hip-Hop / Rap", row["selections"]["genre"])
        self.assertEqual(music3.NONE_OPTION, row["selections"]["subgenre_era"])


if __name__ == "__main__":
    unittest.main()
