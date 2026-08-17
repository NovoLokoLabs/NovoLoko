from __future__ import annotations

import unittest

from test_music3_data_v2 import music3


class MusicPresetCoherenceV2Tests(unittest.TestCase):
    def setUp(self):
        self.presets = music3._load_builtin_music_presets()

    def assertFields(self, name, **expected):
        row = self.presets[name]
        for field, value in expected.items():
            with self.subTest(preset=name, field=field):
                self.assertEqual(value, row[field])

    def test_dance_and_global_presets_no_longer_inherit_rap_or_wrong_mix_defaults(self):
        self.assertFields(
            "Dancehall Summer",
            production_style="Dancehall Digital Punch",
            song_structure="Hook First",
        )
        self.assertFields(
            "Reggaeton Neon",
            production_style="Reggaeton Club Polish",
            song_structure="Hook First",
        )
        self.assertFields("Afrobeat Golden Hour", song_structure="Progressive Long Form")
        self.assertFields(
            "P-Funk Mothership",
            production_style="Classic Funk Live",
            song_structure="Progressive Long Form",
            hook_style="Call and Response",
        )

    def test_generic_vocal_presets_have_style_appropriate_identity_and_variety(self):
        self.assertFields(
            "Shoegaze Bloom",
            vocal_delivery="Shoegaze Buried Vocal",
            vocal_gender_type="Androgynous Airy Lead",
        )
        self.assertFields(
            "Classic Heavy Metal",
            vocal_delivery="Clean Metal Chorus",
            vocal_gender_type="Warm Male Tenor",
        )
        self.assertFields(
            "Deep House Sunset",
            vocal_delivery="Silky R&B Lead",
            vocal_gender_type="Mature Smoky Female Lead",
        )
        self.assertFields(
            "Uplifting Trance Flight",
            vocal_delivery="Ethereal Layered Vocal",
            vocal_gender_type="Female Soprano Lead",
        )
        self.assertFields(
            "Liquid DnB Heartbreak",
            vocal_delivery="Silky R&B Lead",
            vocal_gender_type="Female Alto Lead",
        )

    def test_instrumental_presets_do_not_ask_for_vocal_hooks(self):
        self.assertFields(
            "Berlin Warehouse Techno",
            hook_style="No Vocal Hook",
            explicitness="Instrumental",
        )
        for name in ("Horror Score Pursuit", "Dark Ambient Void"):
            self.assertFields(
                name,
                vocal_delivery="Instrumental Performance",
                vocal_gender_type="Instrumental / No Lead Vocal",
                hook_style="No Vocal Hook",
                storytelling="No Narrative",
                adlibs="None",
            )

    def test_special_novelty_presets_are_not_presented_as_normal_mainstream_genres(self):
        self.assertFields("Gregorian Drill Opera / Holy 808", genre="Experimental")
        self.assertFields(
            "CUDA Out of Memory",
            genre="Comedy / Novelty",
            subgenre_era="Comedy Rap",
        )
        self.assertFields("What Did I Generate", genre="Experimental")

    def test_legacy_style_genres_are_normalized_for_generic_presets(self):
        self.assertFields("Midnight Drift Phonk", genre="Hip-Hop / Rap")
        self.assertFields("Lo-Fi Study Rain", genre="Hip-Hop / Rap")
        self.assertFields("Vaporwave Mall Memory", genre="Electronic")


if __name__ == "__main__":
    unittest.main()
