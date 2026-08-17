from __future__ import annotations

import json
import unittest

from test_music3_data_v2 import music3


class MusicReferencePromptV2Tests(unittest.TestCase):
    def test_missy_clone_uses_curated_dna_without_boom_bap_base_leak(self):
        result = music3.NovaMusicControls().build(
            preset="Missy Elliott — Clone",
            randomize_all=False,
            seed=3761785621294196,
            idea="lost the love of my life",
        )
        style_brief, lyric_direction, section_plan, report, _duration, _seed, _idea, recipe_json = result
        combined_generation_prompt = f"{style_brief}\n{lyric_direction}\n{section_plan}".casefold()

        self.assertIn("futuristic hip-hop", combined_generation_prompt)
        self.assertIn("unconventional drum programming", style_brief.casefold())
        self.assertIn("reference lyric dna", lyric_direction.casefold())
        self.assertIn("inventive braggadocio", lyric_direction.casefold())
        self.assertNotIn("90s east coast boom bap", combined_generation_prompt)
        self.assertNotIn("dusty boom-bap mix", combined_generation_prompt)
        self.assertNotIn("missy elliott", combined_generation_prompt)
        self.assertIn("Hook First", report)
        self.assertIn("suppresses generic base-preset fill", report)

        recipe = json.loads(recipe_json)
        self.assertEqual("explicit_curated_dna_no_generic_base_fill", recipe["reference_generation_policy"])
        self.assertEqual("Hook First", recipe["reference_section_scaffold"])
        self.assertIn("bpm_tempo", recipe["suppressed_reference_base_categories"])

    def test_artist_name_stays_search_audit_only_across_curated_examples(self):
        for preset, reference in (
            ("Måneskin — Clone", "Måneskin"),
            ("Counting Crows — Like", "Counting Crows"),
            ("Nirvana — Clone", "Nirvana"),
            ("Pearl Jam — Like", "Pearl Jam"),
            ("BLACKPINK — Clone", "BLACKPINK"),
        ):
            with self.subTest(preset=preset):
                result = music3.NovaMusicControls().build(
                    preset=preset,
                    randomize_all=False,
                    seed=424242,
                    idea="an original song about walking away from a broken relationship",
                )
                generation = "\n".join((result[0], result[1], result[2])).casefold()
                self.assertNotIn(reference.casefold(), generation)
                self.assertIn("reference", generation)

    def test_manual_instrument_override_replaces_only_instrument_dna_in_final_brief(self):
        result = music3.NovaMusicControls().build(
            preset="Missy Elliott — Clone",
            randomize_all=False,
            seed=424242,
            idea="an original club track",
            instruments="Electric Guitar + Bass + Live Drums",
            control_overrides_json='["instruments"]',
        )
        style_brief = result[0].casefold()
        self.assertNotIn("unconventional drum programming", style_brief)
        # Assert the override's musical content rather than freezing one exact
        # prose template. Editorial prompt wording may improve independently.
        self.assertIn("electric", style_brief)
        self.assertIn("bass", style_brief)
        self.assertIn("drum", style_brief)
        self.assertIn("real-world rock trio", style_brief)
        self.assertIn("futuristic dry-and-punchy mix", style_brief)

    def test_strong_and_loose_reference_prompts_are_structurally_distinct(self):
        strong = music3.NovaMusicControls().build(
            preset="Missy Elliott — Clone", randomize_all=False, seed=424242, idea="an original club track"
        )
        loose = music3.NovaMusicControls().build(
            preset="Missy Elliott — Like", randomize_all=False, seed=424242, idea="an original club track"
        )
        strong_prompt = "\n".join(strong[:3]).casefold()
        loose_prompt = "\n".join(loose[:3]).casefold()

        self.assertIn("influence strength: strong reference", strong_prompt)
        self.assertIn("influence strength: loose reference", loose_prompt)
        self.assertIn("hook tendencies", strong_prompt)
        self.assertNotIn("hook tendencies", loose_prompt)
        self.assertIn("mix and production", loose_prompt)
        self.assertNotEqual(strong_prompt, loose_prompt)
        self.assertNotIn("missy elliott", strong_prompt)
        self.assertNotIn("missy elliott", loose_prompt)


if __name__ == "__main__":
    unittest.main()
