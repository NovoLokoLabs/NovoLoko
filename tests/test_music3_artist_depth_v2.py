from __future__ import annotations

import unittest

from test_music3_data_v2 import music3


class MusicArtistDepthV2Tests(unittest.TestCase):
    def test_major_reference_families_get_full_curated_dna(self):
        presets = music3.load_music_presets()
        for name, needle in (
            ("Foo Fighters — Clone", "huge natural drums"),
            ("Radiohead — Clone", "electronic abstraction"),
            ("Queen — Clone", "operatic vocal stacks"),
            ("Metallica — Clone", "palm-muted precision riffs"),
            ("Linkin Park — Clone", "rap verses"),
            ("Michael Jackson — Clone", "rhythmic vocal accents"),
            ("Taylor Swift — Clone", "specific scenes"),
            ("The Weeknd — Clone", "nocturnal atmosphere"),
        ):
            with self.subTest(name=name):
                row = presets[name]
                self.assertEqual("curated Music Data v2", row["__dna_source"])
                joined = " ".join(row["__dna_traits"].values()).casefold()
                self.assertIn(needle.casefold(), joined)
                self.assertTrue(all(row["__dna_traits"].get(key) for key in (
                    "scene", "vocals", "instruments", "groove", "arrangement",
                    "hooks", "dynamics", "production", "songwriting",
                )))

    def test_beyonce_legacy_ascii_reference_matches_accented_curated_profile(self):
        presets = music3.load_music_presets()
        candidates = [
            row for row in presets.values()
            if str(row.get("reference", "")).casefold() == "beyonce"
            and row.get("reference_mode") == "Clone"
        ]
        self.assertEqual(1, len(candidates))
        row = candidates[0]
        self.assertEqual("curated Music Data v2", row["__dna_source"])
        self.assertIn("elite vocal layering", row["__dna_traits"]["scene"].casefold())

    def test_reggaeton_legacy_child_maps_to_latin_parent(self):
        # Old saved child-genre values should migrate to the broad parent rather
        # than being caught by the substring "reggae".
        from test_music3_data_v2 import data_v2

        self.assertEqual("Latin / Reggaeton", data_v2.broad_genre_for("Reggaeton"))
        self.assertEqual("Latin / Reggaeton", data_v2.broad_genre_for("Latin Pop"))


if __name__ == "__main__":
    unittest.main()
