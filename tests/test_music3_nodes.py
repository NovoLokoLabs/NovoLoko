import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("novoloko_music3_nodes", ROOT / "music3_nodes.py")
music3 = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(music3)


class FakeClip:
    def __init__(self, output):
        self.output = output
        self.instructions = []
        self.cond_stage_model = object()

    def tokenize(self, instruction, **kwargs):
        self.instructions.append((instruction, kwargs))
        return {"instruction": instruction}

    def generate(self, tokens, **kwargs):
        self.generate_kwargs = kwargs
        return [1, 2, 3]

    def decode(self, _ids):
        return self.output


class Music3NodeTests(unittest.TestCase):
    def setUp(self):
        self.user_data = tempfile.TemporaryDirectory()
        self.user_data_patch = patch.object(
            music3, "_user_data_root", return_value=Path(self.user_data.name)
        )
        self.user_data_patch.start()
        for cls in (
            music3.NovaMusicLyricEnhancer,
            music3.NovaMusicLyricsGenerator,
            music3.NovaMusicCaptionEnhancer,
        ):
            cls._cache.clear()

    def test_optional_ollama_writer_uses_loopback_and_generative_clip_contract(self):
        calls = []
        replies = [
            {"response": "", "load_duration": 1_250_000_000, "done": True},
            {"response": "A focused lyric brief", "eval_count": 12, "done": True},
        ]

        class FakeResponse:
            def __init__(self, payload):
                self.payload = payload

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _limit):
                return json.dumps(self.payload).encode("utf-8")

        def fake_urlopen(request, timeout):
            calls.append((request, timeout, json.loads(request.data.decode("utf-8"))))
            return FakeResponse(replies.pop(0))

        with patch.object(music3, "urlopen", side_effect=fake_urlopen):
            writer, status = music3.NovaMusicWriterOllamaLoader().load_writer(
                "novoloko-music-fast", "30m", 8192, 600
            )
            result = music3.NovaMusicLyricEnhancer().enhance(
                writer,
                idea="same benchmark idea",
                lyric_direction="dark hip-hop with dense rhymes",
                seed=12345,
                thinking=False,
            )

        self.assertIn("reported model load 1.250s", status)
        self.assertEqual("A focused lyric brief", result[0])
        self.assertEqual(2, len(calls))
        self.assertEqual(music3.OLLAMA_WRITER_URL, calls[0][0].full_url)
        self.assertEqual("novoloko-music-fast", calls[1][2]["model"])
        self.assertFalse(calls[1][2]["think"])
        self.assertFalse(calls[1][2]["raw"])
        self.assertEqual(12345, calls[1][2]["options"]["seed"])
        self.assertEqual(8192, calls[1][2]["options"]["num_ctx"])
        self.assertIn("NovaMusicWriterOllamaLoader", music3.NODE_CLASS_MAPPINGS)

    def test_ollama_model_catalog_has_friendly_aliases_and_portable_local_choices(self):
        class FakeResponse:
            def __enter__(self): return self
            def __exit__(self, *_args): return False
            def read(self, _limit):
                return json.dumps({"models": [
                    {"name": "novoloko-music-fast:latest"},
                    {"name": "qwen3.5:9b"},
                ]}).encode("utf-8")

        with patch.object(music3, "urlopen", return_value=FakeResponse()):
            catalog = music3._ollama_model_catalog()
        self.assertTrue(catalog["available"])
        labels = {row["name"]: row["label"] for row in catalog["models"]}
        self.assertEqual("FAST — novoloko-music-fast:latest", labels["novoloko-music-fast:latest"])
        self.assertEqual("LOCAL — qwen3.5:9b", labels["qwen3.5:9b"])
        self.assertEqual(["BALANCED", "GEMMA"], catalog["missing_recommended"])

    def test_main_writer_backend_selector_is_lazy_explicit_and_portable(self):
        selector = music3.NovaMusicWriterBackendSelector()
        schema = selector.INPUT_TYPES()
        self.assertEqual(selector.OLLAMA, schema["required"]["backend"][1]["default"])
        self.assertTrue(schema["optional"]["ollama_writer"][1]["lazy"])
        self.assertTrue(schema["optional"]["comfy_writer"][1]["lazy"])
        self.assertEqual(["ollama_writer"], selector.check_lazy_status(selector.OLLAMA))
        self.assertEqual(["comfy_writer"], selector.check_lazy_status(selector.COMFY))
        ollama = type("Writer", (), {"model": "portable-local-model"})()
        comfy = object()
        selected, status = selector.select_writer(selector.OLLAMA, ollama_writer=ollama)
        self.assertIs(ollama, selected)
        self.assertIn("portable-local-model", status)
        selected, status = selector.select_writer(selector.COMFY, comfy_writer=comfy)
        self.assertIs(comfy, selected)
        self.assertIn("qwen3VLInstruct4bHeretic_v10", status)
        with self.assertRaisesRegex(RuntimeError, "no Ollama writer"):
            selector.select_writer(selector.OLLAMA)
        with self.assertRaisesRegex(RuntimeError, "no Comfy writer"):
            selector.select_writer(selector.COMFY)

    def tearDown(self):
        self.user_data_patch.stop()
        self.user_data.cleanup()

    def test_catalog_has_every_independent_category_and_named_presets(self):
        catalog = music3.load_music_catalog()
        presets = music3.load_music_presets()
        self.assertEqual(19, len(catalog))
        self.assertTrue(
            {
                "Heavy Rap / Trap / Drill",
                "Cinematic Synthwave",
                "Ethereal Dream Pop",
                "Acoustic Soul Storyteller",
                "Industrial Dark Techno",
                "Epic Orchestral Last Stand",
                "Gregorian Drill Opera / Holy 808",
                "CUDA Out of Memory",
                "What Did I Generate",
            }.issubset(presets),
        )
        expected_counts = {
            "genre": 107,
            "subgenre_era": 386,
            "mood": 65,
            "vocal_delivery": 109,
            "vocal_gender_type": 79,
            "instruments": 132,
            "production_style": 120,
            "bpm_tempo": 44,
            "song_structure": 53,
            "hook_style": 58,
            "themes": 83,
            "explicitness": 14,
            "aggression": 24,
            "darkness": 24,
            "rhyme_density": 24,
            "wordplay": 29,
            "storytelling": 30,
            "adlibs": 30,
            "song_length": 18,
        }
        self.assertEqual(expected_counts, {key: len(rows) for key, rows in catalog.items()})
        self.assertEqual(1429, sum(len(rows) for rows in catalog.values()))
        self.assertEqual(1197, len(presets))
        self.assertEqual(list(music3.CATEGORY_SPECS), list(catalog))
        theme_names = {row["name"] for row in catalog["themes"]}
        self.assertTrue(
            {
                "Cash and Luxury",
                "Luxury Cars",
                "Weapons Imagery",
                "Rivals and Street Life",
                "Success and Come-Up",
                "Paranoia",
                "Hustle",
                "Betrayal",
                "Revenge",
            }.issubset(theme_names)
        )
        instrument_names = {row["name"] for row in catalog["instruments"]}
        self.assertTrue(
            {
                "Electric Guitar + Bass + Live Drums",
                "Heavy Guitars + Bass + Double-Kick Drums",
                "Grunge Guitars + Bass + Loose Live Drums",
                "Pop-Punk Guitars + Bass + Punchy Drums",
                "Acoustic Guitar + Bass + Brushes",
                "Piano + Bass + Live Drums",
                "Funk Guitar + Bass + Tight Drums",
                "Synths + 808 Bass + Trap Drums",
                "Strings + Piano + Cinematic Percussion",
                "Industrial Synths + Distorted Bass + Electronic Drums",
            }.issubset(instrument_names)
        )

    def test_reference_presets_are_foldered_searchable_and_prompt_neutral(self):
        payload = music3._music_controls_api_payload()
        presets = {item["name"]: item for item in payload["presets"]}
        self.assertTrue(all(item["folder"] for item in presets.values()))
        self.assertGreaterEqual(len({item["folder"] for item in presets.values()}), 15)
        pearl_jam = presets["Pearl Jam — Clone"]
        self.assertEqual("Artist References / Rock & Alternative", pearl_jam["folder"])
        self.assertEqual("Pearl Jam", pearl_jam["reference"])
        self.assertEqual("Clone", pearl_jam["reference_mode"])
        self.assertIn("grunge", pearl_jam["keywords"])
        artist_rows = [item for item in presets.values() if item["reference"] and not item["hidden"]]
        self.assertEqual(754, len(artist_rows))
        self.assertEqual(377, len({item["reference"] for item in artist_rows}))
        self.assertEqual({"Clone", "Like"}, {item["reference_mode"] for item in artist_rows})
        for artist in (
            "Måneskin", "Counting Crows", "BLACKPINK", "Destiny's Child",
            "Florence + The Machine", "Evanescence", "Chappell Roan", "TWICE",
        ):
            for mode in music3.REFERENCE_MODES:
                item = presets[f"{artist} — {mode}"]
                self.assertEqual(artist, item["reference"])
                self.assertFalse(item["hidden"])
                search_text = " ".join(
                    str(item.get(key, ""))
                    for key in ("name", "reference", "keywords", "description")
                ).casefold()
                self.assertIn(artist.casefold(), search_text)
        legacy = presets["Pearl Jam - Seattle Arena Grunge"]
        self.assertTrue(legacy["hidden"])
        self.assertEqual("Pearl Jam — Like", legacy["migration_target"])

        clone = music3.NovaMusicControls().build(preset="Pearl Jam — Clone", seed=123)
        like = music3.NovaMusicControls().build(preset="Pearl Jam — Like", seed=123)
        legacy_output = music3.NovaMusicControls().build(preset="Pearl Jam - Seattle Arena Grunge", seed=123)
        self.assertNotEqual(clone[0], like[0])
        self.assertGreater(len(clone[0]), len(like[0]))
        for output in (clone, like, legacy_output):
            self.assertNotIn("Pearl Jam", output[0])
            self.assertNotIn("Pearl Jam", output[1])
            self.assertIn("Reference DNA priority", output[0])
        self.assertIn("Reference mode: Clone", clone[3])
        self.assertIn("Reference traits locked:", clone[3])
        self.assertIn("Reference mode: Like", like[3])
        self.assertIn("Reference mode: Like", legacy_output[3])

        overridden = music3.NovaMusicControls().build(
            preset="Pearl Jam — Clone",
            seed=123,
            instruments="Synths + 808 Bass + Trap Drums",
            control_overrides_json=json.dumps(["instruments"]),
        )
        self.assertIn("Synths + 808 Bass + Trap Drums", overridden[3])
        self.assertIn("Manual Reference DNA overrides: Band / instrument setup", overridden[3])
        self.assertNotIn("instrument, drum, guitar, bass and synth tone", json.loads(overridden[-1])["reference_traits_locked"])

    def test_spoken_voice_presets_explicitly_suppress_singing(self):
        presets = music3.load_music_presets()
        spoken = presets["Intimate Seductive Whisper"]
        self.assertEqual("Spoken Word / Voice", spoken["genre"])
        self.assertEqual("No Instruments - Dry Spoken Voice", spoken["instruments"])
        output = music3.NovaMusicControls().build(
            preset="Intimate Seductive Whisper", seed=456
        )
        self.assertIn("never sung", output[0])
        self.assertIn("no singing", output[0])
        spoken_count = sum(
            item.get("folder", "").startswith("Spoken Voice")
            for item in music3._music_controls_api_payload()["presets"]
        )
        self.assertGreaterEqual(spoken_count, 20)

    def test_control_schema_exposes_every_csv_category_and_randomization(self):
        required = music3.NovaMusicControls.INPUT_TYPES()["required"]
        self.assertTrue(set(music3.CATEGORY_SPECS).issubset(required))
        self.assertIn("randomize_all", required)
        self.assertIn(music3.RANDOM_PRESET, required["preset"][0])
        self.assertIn(music3.NONE_PRESET, required["preset"][0])
        self.assertIn("allow_random_none", required)
        self.assertEqual(list(music3.RANDOM_PRESET_SCOPES), required["random_preset_scope"][0])
        self.assertIn("random_preset_filter", required)
        self.assertIn("idea", required)
        self.assertIn("control_overrides_json", required)
        self.assertEqual(list(music3.SEED_AFTER_RUN_MODES), required["seed_after_run"][0])
        self.assertTrue(required["seed"][1]["control_after_generate"])
        self.assertTrue(required["idea"][1]["multiline"])
        self.assertEqual("music_idea", music3.NovaMusicControls.RETURN_NAMES[-2])
        self.assertEqual("controls_recipe_json", music3.NovaMusicControls.RETURN_NAMES[-1])
        for key in music3.CATEGORY_SPECS:
            self.assertEqual(
                [music3.NONE_OPTION, music3.CUSTOM_OPTION, music3.RANDOM_OPTION],
                required[key][0][:3],
            )
            self.assertIn(f"custom_{key}", required)

    def test_plain_language_controls_have_selected_value_help_and_stable_values(self):
        payload = music3._music_controls_api_payload()
        self.assertEqual(19, len(payload["categories"]))
        categories = {item["key"]: item for item in payload["categories"]}
        self.assertEqual("How should the singer perform?", categories["vocal_delivery"]["label"])
        self.assertEqual("How should it sound?", categories["production_style"]["label"])
        self.assertEqual("What kind of chorus / hook?", categories["hook_style"]["label"])
        self.assertEqual("Energy / intensity", categories["aggression"]["label"])
        self.assertEqual("Mood darkness", categories["darkness"]["label"])
        self.assertEqual("How rhyme-heavy?", categories["rhyme_density"]["label"])
        self.assertEqual("Story style", categories["storytelling"]["label"])
        self.assertEqual("Extra vocal shouts / phrases", categories["adlibs"]["label"])
        self.assertEqual("Song layout", categories["song_structure"]["label"])
        for category in categories.values():
            self.assertTrue(category["description"])
            self.assertTrue(all(option["value"] and option["label"] and option["description"] for option in category["options"]))
        aggression = {item["value"]: item for item in categories["aggression"]["options"]}
        self.assertEqual("Maximum — explosive, controlled impact", aggression["Maximum Impact"]["label"])
        below_fold_examples = {
            "explicitness": ("Uncensored", "Uncensored — frequent natural profanity even from a clean idea"),
            "aggression": ("Relentless", "Relentless — sustained maximum pressure"),
            "darkness": ("Horror", "Horror-dark — threatening and unsettling"),
            "rhyme_density": ("Hook Simple / Verses Dense", "Simple hook, denser technical verses"),
            "wordplay": ("Triple Entendres", "Triple meanings — highly layered punchlines"),
            "storytelling": ("Reverse Chronology", "Reverse chronology — reveal events backward"),
            "adlibs": ("Crew Responses", "Crew responses — group replies to lead lines"),
            "song_length": ("Extended Club Mix", "Extended club mix — longer intro, breaks, and outro"),
        }
        for key, (value, expected_label) in below_fold_examples.items():
            options = {item["value"]: item for item in categories[key]["options"]}
            self.assertEqual(expected_label, options[value]["label"])
            self.assertTrue(options[value]["description"])

    def test_explicitness_is_an_active_distinct_lyric_requirement(self):
        rows = {row["name"]: row["prompt"] for row in music3.load_music_catalog()["explicitness"]}
        self.assertIn("frequent natural profanity", rows["Very Explicit"])
        self.assertIn("sexual or adult language", rows["Very Explicit"])
        self.assertIn("even when the short idea contains no profanity", rows["Uncensored"])
        self.assertIn("no profanity", rows["Clean"])
        self.assertNotIn("frequent natural profanity", rows["Clean"])
        node = music3.NovaMusicControls()
        very_explicit = node.build(
            preset=music3.CUSTOM_PRESET,
            idea="a chaotic late-night breakup",
            explicitness="Very Explicit",
        )
        self.assertIn("frequent natural profanity", very_explicit[1])
        uncensored = node.build(
            preset=music3.CUSTOM_PRESET,
            idea="angry breakup song about betrayal",
            explicitness="Uncensored",
        )
        self.assertIn("even when the short idea contains no profanity", uncensored[1])
        lyric_enhancer = music3.NovaMusicLyricEnhancer().enhance(
            FakeClip("a focused breakup brief with no profanity copied from the clean idea"),
            idea="angry breakup song about betrayal",
            lyric_direction=uncensored[1],
        )
        self.assertIn("active writing requirement", lyric_enhancer[1])
        self.assertIn("NON-NEGOTIABLE LANGUAGE POLICY", lyric_enhancer[0])
        self.assertIn("even though the clean song idea contains no profanity", lyric_enhancer[0])

        class RetryClip(FakeClip):
            def __init__(self):
                super().__init__("")
                self.outputs = [
                    "[Verse 1]\nYou lied and left me broken",
                    "[Verse 1]\nYou fucking lied and left me broken",
                ]

            def decode(self, _ids):
                return self.outputs.pop(0)

        retry_clip = RetryClip()
        generator = music3.NovaMusicLyricsGenerator().generate_lyrics(
            retry_clip, lyric_brief=lyric_enhancer[0], section_plan="[Verse 1]"
        )
        self.assertIn("positive style requirement", generator[1])
        self.assertIn("never turn the song into real-world instructions", generator[1])
        self.assertIn("REVISION REQUIRED", generator[1])
        self.assertIn("fucking", generator[0])
        self.assertEqual(2, len(retry_clip.instructions))
        self.assertIn("Rewrote one too-clean draft", generator[2])
    def test_writer_schemas_use_valid_music_lab_defaults(self):
        expected = {
            music3.NovaMusicLyricEnhancer: (0.85, 2048),
            music3.NovaMusicLyricsGenerator: (0.90, 4096),
            music3.NovaMusicCaptionEnhancer: (0.70, 2048),
        }
        for node_class, (creativity_default, length_default) in expected.items():
            required = node_class.INPUT_TYPES()["required"]
            self.assertEqual(
                {
                    "default": creativity_default,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.05,
                },
                required["creativity"][1],
            )
            self.assertEqual(
                {
                    "default": length_default,
                    "min": 256,
                    "max": 8192,
                    "step": 128,
                },
                required["max_length"][1],
            )
            self.assertFalse(required["thinking"][1]["default"])

    def test_heavy_rap_preset_is_complete_and_batch_transparent(self):
        output = music3.NovaMusicControls().build(seed=99)
        music_brief, lyric_direction, section_plan, report, duration, seed, idea, recipe_json = output
        self.assertIn("Global Metadata:", music_brief)
        self.assertIn("Vocal Details:", music_brief)
        self.assertIn("Arrangement:", music_brief)
        self.assertIn("cash", lyric_direction.lower())
        self.assertIn("luxury cars", lyric_direction.lower())
        self.assertIn("weapons imagery", lyric_direction.lower())
        self.assertIn("rivals", lyric_direction.lower())
        self.assertIn("paranoia", lyric_direction.lower())
        self.assertIn("[Verse 1]", section_plan)
        self.assertEqual(26, len(report.splitlines()))
        self.assertIn("Preset: Heavy Rap / Trap / Drill", report)
        self.assertIn("Lyric themes: Cash, Cars, Rivals and Paranoia", report)
        self.assertEqual(180.0, duration)
        self.assertEqual(99, seed)
        self.assertEqual("", idea)
        self.assertEqual(music3.CONTROLS_RECIPE_SCHEMA, json.loads(recipe_json)["schema"])

    def test_randomization_is_deterministic_and_auditable(self):
        node = music3.NovaMusicControls()
        first = node.build(randomize_all=True, seed=123456)
        second = node.build(randomize_all=True, seed=123456)
        other = node.build(randomize_all=True, seed=123457)
        self.assertEqual(first, second)
        self.assertNotEqual(first[3], other[3])
        self.assertIn("Randomize all: On", first[3])
        self.assertEqual(26, len(first[3].splitlines()))

    def test_seed_only_after_run_policy_never_changes_resolved_controls(self):
        node = music3.NovaMusicControls()
        fixed = node.build(preset=music3.CUSTOM_PRESET, seed=4321, genre=music3.RANDOM_OPTION, seed_after_run="Fixed")
        random_seed = node.build(preset=music3.CUSTOM_PRESET, seed=4321, genre=music3.RANDOM_OPTION, seed_after_run="Randomize Seed")
        self.assertEqual(fixed[:3], random_seed[:3])
        self.assertEqual(fixed[4:7], random_seed[4:7])
        self.assertIn("After run: Randomize Seed (seed only; 19 controls unchanged)", random_seed[3])
        recipe = json.loads(random_seed[-1])
        self.assertEqual("Randomize Seed", recipe["seed_after_run"])
        self.assertEqual(json.loads(fixed[-1])["resolved_selections"], recipe["resolved_selections"])

        seed_a, seed_b = 1111, 2222
        run_n = node.build(
            preset=music3.CUSTOM_PRESET,
            seed=seed_a,
            seed_after_run="Randomize Seed",
            idea="same idea",
            genre="Rock",
        )
        run_n_plus_1 = node.build(
            preset=music3.CUSTOM_PRESET,
            seed=seed_b,
            seed_after_run="Randomize Seed",
            idea="same idea",
            genre="Rock",
        )
        self.assertEqual(seed_a, run_n[5], "run N uses the seed visible when it was queued")
        self.assertEqual(seed_b, run_n_plus_1[5], "run N+1 uses the post-run seed with no dummy run")
        first_recipe = json.loads(run_n[-1])
        next_recipe = json.loads(run_n_plus_1[-1])
        self.assertEqual(first_recipe["selections"], next_recipe["selections"])

    def test_five_minute_target_reaches_generator_and_expands_writer_plan(self):
        output = music3.NovaMusicControls().build(
            preset=music3.CUSTOM_PRESET,
            song_length="About 5 Minutes",
            song_structure="Rap Anthem",
        )
        self.assertEqual(300.0, output[4])
        self.assertIn("TARGET ~5:00", output[2])
        self.assertIn("at least 10 substantial tagged sections", output[2])
        self.assertIn("MiniMax may still finish early", output[2])
        generated = music3.NovaMusicLyricsGenerator().generate_lyrics(
            FakeClip("[Verse 1]\nLong-form lyric"), lyric_brief=output[1], section_plan=output[2]
        )
        self.assertIn("five-minute target", generated[1])
        self.assertIn("TARGET ~5:00", generated[1])

    def test_random_named_preset_scope_is_seed_stable_and_genre_filtered(self):
        node = music3.NovaMusicControls()
        first = node.build(
            seed=2026,
            random_preset_scope="Genre",
            random_preset_filter="Rock",
        )
        second = node.build(
            seed=2026,
            random_preset_scope="Genre",
            random_preset_filter="Rock",
        )
        self.assertEqual(first, second)
        preset_name = next(line.split(": ", 1)[1] for line in first[3].splitlines() if line.startswith("Preset: "))
        self.assertEqual("Rock", music3.load_music_presets()[preset_name]["genre"])
        self.assertIn(f"Random preset scope: Genre / Rock -> {preset_name}", first[3])

    def test_random_named_presets_favor_practical_music_over_preserved_novelty(self):
        practical = {"name": "Practical Rock Song", "genre": "Rock"}
        novelty = {"name": "CUDA Out of Memory", "genre": "Experimental"}
        self.assertEqual(12.0, music3._preset_random_weight(practical))
        self.assertEqual(1.0, music3._preset_random_weight(novelty))
        rows = [
            {"name": "practical", "_random_weight": 12.0},
            {"name": "novelty", "_random_weight": 1.0},
        ]
        results = [music3._seeded_choice(seed, "weighted-preset", rows)["name"] for seed in range(400)]
        self.assertGreater(results.count("practical"), results.count("novelty") * 6)

    def test_none_custom_and_random_rules_are_optional_safe_and_transparent(self):
        node = music3.NovaMusicControls()
        none = node.build(
            preset=music3.CUSTOM_PRESET,
            genre=music3.NONE_OPTION,
            mood=music3.CUSTOM_OPTION,
            custom_mood="icy but hopeful",
            seed=44,
        )
        self.assertNotIn("None / No preference", none[0])
        self.assertIn("icy but hopeful", none[0])
        self.assertIn("Genre: None / No preference (no prompt contribution)", none[3])
        self.assertIn("Overall mood: Custom... -> icy but hopeful", none[3])

        empty_custom = node.build(
            preset=music3.CUSTOM_PRESET,
            genre=music3.CUSTOM_OPTION,
            custom_genre="",
        )
        self.assertIn("Genre: Custom... (empty; no prompt contribution)", empty_custom[3])

        resolved, *_ = node.resolve_selections(
            preset=music3.CUSTOM_PRESET,
            seed=9,
            genre=music3.RANDOM_OPTION,
            custom_genre="",
            allow_random_none=False,
        )
        self.assertNotIn(resolved["genre"]["_choice"], {music3.CUSTOM_OPTION, music3.NONE_OPTION})

    def test_unified_controls_recipe_keeps_idea_decisions_resolved_values_and_policy(self):
        output = music3.NovaMusicControls().build(
            preset=music3.CUSTOM_PRESET,
            idea="rainy neon heartbreak",
            genre=music3.RANDOM_OPTION,
            mood=music3.CUSTOM_OPTION,
            custom_mood="cold but hopeful",
            vocal_delivery=music3.NONE_OPTION,
            allow_random_none=True,
            random_preset_scope="Off",
            seed=987654,
        )
        recipe = json.loads(output[-1])
        self.assertEqual("rainy neon heartbreak", output[-2])
        self.assertEqual("rainy neon heartbreak", recipe["original_idea"])
        self.assertEqual(music3.RANDOM_OPTION, recipe["selections"]["genre"])
        self.assertTrue(recipe["resolved_selections"]["genre"])
        self.assertEqual(music3.CUSTOM_OPTION, recipe["selections"]["mood"])
        self.assertEqual("cold but hopeful", recipe["custom_values"]["mood"])
        self.assertEqual(music3.NONE_OPTION, recipe["selections"]["vocal_delivery"])
        self.assertTrue(recipe["allow_random_none"])
        self.assertEqual(987654, recipe["seed"])

    def test_unknown_or_missing_values_fall_back_without_errors(self):
        resolved, preset, randomize, seed = music3.NovaMusicControls.resolve_selections(
            preset="removed preset",
            randomize_all=None,
            seed="bad",
            genre="removed genre",
        )
        self.assertEqual(music3.CUSTOM_PRESET, preset)
        self.assertFalse(randomize)
        self.assertEqual(0, seed)
        self.assertEqual("Hip-Hop / Rap", resolved["genre"]["name"])
        self.assertEqual("", music3.NovaMusicIdea().emit(None)[0])

    def test_lyric_enhancer_makes_a_brief_not_finished_lyrics(self):
        clip = FakeClip("Hook concept: a cold arrival turns pressure into victory.")
        output = music3.NovaMusicLyricEnhancer().enhance(
            clip,
            idea="heavy rap with cash and guns",
            lyric_direction="Themes: fictional rivalry and paranoia",
            seed=7,
        )
        self.assertEqual(clip.output, output[0])
        self.assertIn("not finished lyrics", output[1])
        self.assertIn("fictional song imagery", output[1])
        self.assertNotIn("[Verse 1]", output[0])

    def test_lyrics_generator_preserves_minimax_section_tags(self):
        clip = FakeClip("[Intro]\nAyy\n\n[Verse 1]\nCold lights\n\n[Chorus]\nStill rise")
        output = music3.NovaMusicLyricsGenerator().generate_lyrics(
            clip,
            lyric_brief="A fictional rise under pressure",
            section_plan="[Intro] -> [Verse 1] -> [Chorus]",
            seed=8,
        )
        self.assertIn("[Intro]", output[0])
        self.assertIn("[Verse 1]", output[0])
        self.assertIn("[Chorus]", output[0])
        self.assertIn("3 MiniMax section tag(s)", output[2])

    def test_lyrics_generator_repairs_missing_tag_and_bypass_is_instrumental(self):
        clip = FakeClip("One untagged line")
        generated = music3.NovaMusicLyricsGenerator().generate_lyrics(
            clip, lyric_brief="brief", section_plan="plan"
        )
        self.assertTrue(generated[0].startswith("[Verse 1]\n"))
        bypassed = music3.NovaMusicLyricsGenerator().generate_lyrics(
            clip, lyric_brief="brief", section_plan="plan", enabled=False
        )
        self.assertEqual("[Instrumental]", bypassed[0])

    def test_caption_path_has_no_lyrics_input_and_enforces_three_headings(self):
        schema = music3.NovaMusicCaptionEnhancer.INPUT_TYPES()
        self.assertNotIn("lyrics", schema["required"])
        self.assertNotIn("lyrics", schema.get("optional", {}))
        caption = (
            "Global Metadata: dark trap at 142 BPM.\n\n"
            "Vocal Details: deep aggressive lead.\n\n"
            "Arrangement: piano intro, two verses, bridge, final hook."
        )
        clip = FakeClip(caption)
        output = music3.NovaMusicCaptionEnhancer().enhance_caption(
            clip,
            idea="heavy rap with cash and guns",
            music_style_brief=caption,
            seed=9,
        )
        self.assertEqual(caption, output[0])
        self.assertIn("do not write, quote, summarize, or replace lyrics", output[1])
        self.assertIn("Reference DNA priority", output[1])
        self.assertIn("Lyrics remained on the separate lyric path", output[2])

    def test_caption_falls_back_to_safe_csv_brief_if_headings_are_lost(self):
        brief = "Global Metadata: rap\n\nVocal Details: deep\n\nArrangement: drums"
        clip = FakeClip("dark song with drums")
        output = music3.NovaMusicCaptionEnhancer().enhance_caption(
            clip, idea="test", music_style_brief=brief
        )
        self.assertEqual(brief, output[0])
        self.assertIn("safety fallback", output[2])

    def test_only_current_music_node_ids_are_registered(self):
        self.assertEqual(
            {
                "NovaMusicIdea",
                "NovaMusicControls",
                "NovaMusicWriterOllamaLoader",
                "NovaMusicWriterBackendSelector",
                "NovaMusicLyricEnhancer",
                "NovaMusicLyricsGenerator",
                "NovaMusicCaptionEnhancer",
                "NovaMusicSaveAudioMetadata",
                "NovaMusicAudioLibrary",
            },
            set(music3.NODE_CLASS_MAPPINGS),
        )
        self.assertFalse(any("V1" in name or "V2" in name or "Legacy" in name for name in music3.NODE_CLASS_MAPPINGS))

    def test_example_workflow_keeps_caption_and_lyrics_on_separate_inputs(self):
        path = ROOT / "workflows" / "NovoLoko MiniMax Music 3 - Lab v4.6.4.json"
        workflow = json.loads(path.read_text(encoding="utf-8"))
        nodes = {node["id"]: node for node in workflow["nodes"]}
        types = {node["type"] for node in workflow["nodes"]}
        self.assertTrue(
            (set(music3.NODE_CLASS_MAPPINGS) - {"NovaMusicIdea"}).issubset(types)
        )
        self.assertNotIn("NovaMusicIdea", types)
        self.assertIn("MiniMaxMusic3TextEncode", {n["type"] for n in workflow["definitions"]["subgraphs"][0]["nodes"]})

        selector = next(node for node in workflow["nodes"] if node["type"] == "NovaMusicWriterBackendSelector")
        ollama = next(node for node in workflow["nodes"] if node["type"] == "NovaMusicWriterOllamaLoader")
        fallback = nodes[3]
        seed_lab = next(node for node in workflow["nodes"] if node["type"] == "NovaSeedLab")
        controls = next(node for node in workflow["nodes"] if node["type"] == "NovaMusicControls")
        self.assertEqual("FAST / BALANCED / Gemma / Other installed local models (Ollama GGUF)", selector["widgets_values"][0])
        self.assertEqual("novoloko-music-fast", ollama["widgets_values"][0])
        self.assertEqual("CLIPLoader", fallback["type"])
        self.assertEqual(48, len(controls["widgets_values"]))
        links_by_id = {link[0]: link for link in workflow["links"]}
        self.assertEqual(ollama["id"], links_by_id[selector["inputs"][1]["link"]][1])
        self.assertEqual(fallback["id"], links_by_id[selector["inputs"][2]["link"]][1])
        self.assertEqual(seed_lab["id"], links_by_id[controls["inputs"][2]["link"]][1])
        for node_type in ("NovaMusicLyricEnhancer", "NovaMusicLyricsGenerator", "NovaMusicCaptionEnhancer"):
            writer = next(node for node in workflow["nodes"] if node["type"] == node_type)
            self.assertEqual(selector["id"], links_by_id[writer["inputs"][0]["link"]][1])

        links = {link[0]: link for link in workflow["links"]}
        generator = nodes[10]
        caption_link = links[generator["inputs"][0]["link"]]
        lyrics_link = links[generator["inputs"][1]["link"]]
        self.assertEqual("NovaMusicCaptionEnhancer", nodes[caption_link[1]]["type"])
        self.assertEqual(0, caption_link[2])
        self.assertEqual("NovaMusicLyricsGenerator", nodes[lyrics_link[1]]["type"])
        self.assertEqual(0, lyrics_link[2])
        self.assertNotEqual(caption_link[1], lyrics_link[1])
        self.assertEqual("NovaMusicControls", nodes[links[generator["inputs"][2]["link"]][1]]["type"])
        self.assertEqual("NovaMusicControls", nodes[links[generator["inputs"][3]["link"]][1]]["type"])

        display_titles = {node.get("title") for node in workflow["nodes"] if node["type"] == "NovaTextDisplay"}
        self.assertIn("EXACT OPTIONS SELECTED - BATCH TRANSPARENCY", display_titles)
        self.assertIn("FINAL MINIMAX LYRICS", display_titles)
        self.assertIn("FINAL MINIMAX MUSIC CAPTION", display_titles)

        expected_writer_values = {
            "NovaMusicLyricEnhancer": (0.85, 2048),
            "NovaMusicLyricsGenerator": (0.90, 4096),
            "NovaMusicCaptionEnhancer": (0.70, 2048),
        }
        for node_type, expected in expected_writer_values.items():
            writer = next(node for node in workflow["nodes"] if node["type"] == node_type)
            self.assertEqual([], writer["widgets_values"])
            self.assertEqual(expected[0], writer["properties"]["novaMusicWriterCreativityDefault"])
            self.assertEqual(expected[1], writer["properties"]["novaMusicWriterMaxLengthDefault"])
            self.assertFalse(writer["properties"]["novaMusicWriterThinkingDefault"])

        saver = next(node for node in workflow["nodes"] if node["type"] == "NovaMusicSaveAudioMetadata")
        self.assertEqual("audio/NovoLoko", saver["widgets_values"][0])
        self.assertEqual("Holy808", saver["widgets_values"][1])
        self.assertTrue(saver["widgets_values"][2])
        self.assertTrue(saver["widgets_values"][3])
        self.assertFalse(saver["widgets_values"][5])
        self.assertEqual("WAV (24-bit)", saver["widgets_values"][6])
        self.assertEqual("Batch: keep loaded", saver["widgets_values"][7])

        memory = next(node for node in workflow["nodes"] if node["type"] == "NovaMemoryManager")
        player = next(node for node in workflow["nodes"] if node["type"] == "NovaMusicAudioLibrary")
        links = {link[0]: link for link in workflow["links"]}
        self.assertEqual([11, 0, memory["id"], 0], links[memory["inputs"][0]["link"]][1:5])
        self.assertEqual([11, 1, player["id"], 0], links[player["inputs"][0]["link"]][1:5])
        self.assertEqual(["Fast Batch / Reuse", False, False, False, False], memory["widgets_values"])
        self.assertTrue(player["properties"]["novaMusicVisualizerEnabled"])
        self.assertEqual("Neon Waveform", player["properties"]["novaMusicVisualizerStyle"])
        guide = next(node for node in workflow["nodes"] if node["type"] == "MarkdownNote")
        self.assertIn("Spoken voice only", guide["widgets_values"][0])
        self.assertIn("live visualizer", guide["widgets_values"][0])
        self.assertIn("Load Track Recipe", guide["widgets_values"][0])
        self.assertIn("Estimated Karaoke", guide["widgets_values"][0])
        self.assertIn("original idea", guide["widgets_values"][0])
        self.assertIn("Artist references: Clone vs Like", guide["widgets_values"][0])
        self.assertIn("Very Explicit", guide["widgets_values"][0])
        self.assertIn("Seed-only randomization", guide["widgets_values"][0])
        self.assertIn("MiniMax may still finish earlier", guide["widgets_values"][0])
        controls = next(node for node in workflow["nodes"] if node["type"] == "NovaMusicControls")
        self.assertEqual([620, 760], controls["size"])
        self.assertEqual("idea", controls["inputs"][-3]["name"])
        self.assertEqual("control_overrides_json", controls["inputs"][-2]["name"])
        self.assertEqual("seed_after_run", controls["inputs"][-1]["name"])
        self.assertEqual("fixed", controls["widgets_values"][3])
        self.assertEqual("[]", controls["widgets_values"][-2])
        self.assertEqual("Fixed", controls["widgets_values"][-1])
        self.assertEqual("music_idea", controls["outputs"][-2]["name"])
        self.assertEqual("controls_recipe_json", controls["outputs"][-1]["name"])
        self.assertTrue(any(link[1:5] == [controls["id"], 7, saver["id"], 15] for link in workflow["links"]))

        occupied = set()
        for link_id, source_id, source_slot, target_id, target_slot, _type in workflow["links"]:
            self.assertLess(source_slot, len(nodes[source_id]["outputs"]), f"undefined output on link {link_id}")
            self.assertLess(target_slot, len(nodes[target_id]["inputs"]), f"undefined input on link {link_id}")
            self.assertNotIn((target_id, target_slot), occupied, f"duplicate target on link {link_id}")
            occupied.add((target_id, target_slot))
            self.assertEqual(link_id, nodes[target_id]["inputs"][target_slot]["link"])
            self.assertIn(link_id, nodes[source_id]["outputs"][source_slot]["links"])

        timer = next(node for node in workflow["nodes"] if node["type"] == "NovaGenerationTimer")
        expected_timer = {
            "novaTimer_displayPreset": "Full Stats",
            "novaTimer_cornerRadius": 5,
            "novaTimer_historyLimit": 20,
            "novaTimer_showBackground": True,
            "novaTimer_showBorder": True,
            "novaTimer_showStatus": True,
            "novaTimer_showAverage": True,
            "novaTimer_showLast": True,
            "novaTimer_showBest": True,
            "novaTimer_glow": False,
        }
        for key, value in expected_timer.items():
            self.assertEqual(value, timer["properties"][key])
        self.assertNotIn("novaTimerHistory", timer["properties"])
        self.assertNotIn("novaTimerLastMs", timer["properties"])

    def test_writer_ab_workflow_changes_only_shared_writer_backend(self):
        source = json.loads(
            (ROOT / "workflows" / "NovoLoko MiniMax Music 3 - Lab v4.6.0.json").read_text(encoding="utf-8")
        )
        benchmark = json.loads(
            (ROOT / "workflows" / "NovoLoko MiniMax Music 3 - Writer A-B v4.6.1.json").read_text(encoding="utf-8")
        )
        source_nodes = {node["id"]: node for node in source["nodes"]}
        benchmark_nodes = {node["id"]: node for node in benchmark["nodes"]}
        changed = [node_id for node_id in source_nodes if source_nodes[node_id] != benchmark_nodes[node_id]]
        self.assertEqual([3], changed)
        writer = benchmark_nodes[3]
        self.assertEqual("NovaMusicWriterOllamaLoader", writer["type"])
        self.assertEqual(["novoloko-music-fast", "30m", 8192, 600], writer["widgets_values"])
        self.assertEqual([14, 15, 16], writer["outputs"][0]["links"])
        self.assertEqual(source["links"], benchmark["links"])
        self.assertIn("minimax_music3_text_encoder_pruned_int8_convrot.safetensors", json.dumps(benchmark))
        self.assertEqual("4.6.1", benchmark["extra"]["novolokoMusicLabVersion"])

    def test_v451_workflow_migration_repairs_runaway_height_and_seed_control_shift(self):
        migration_path = ROOT / "tools" / "migrate_music_workflow_v451.py"
        migration_spec = importlib.util.spec_from_file_location("novoloko_v451_migration", migration_path)
        migration = importlib.util.module_from_spec(migration_spec)
        assert migration_spec and migration_spec.loader
        migration_spec.loader.exec_module(migration)
        workflow_path = ROOT / "workflows" / "NovoLoko MiniMax Music 3 - Lab v4.5.1.json"
        workflow = json.loads(workflow_path.read_text(encoding="utf-8"))
        controls = next(node for node in workflow["nodes"] if node["type"] == "NovaMusicControls")
        saver = next(node for node in workflow["nodes"] if node["type"] == "NovaMusicSaveAudioMetadata")
        original_links = workflow["links"]
        controls["size"][1] = 42_825_734
        controls["widgets_values"].insert(3, "randomize")
        saver["widgets_values"].pop()
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "source.json"
            destination = Path(temporary) / "repaired.json"
            source.write_text(json.dumps(workflow), encoding="utf-8")
            migration.migrate(source, destination)
            repaired = json.loads(destination.read_text(encoding="utf-8"))
        controls = next(node for node in repaired["nodes"] if node["type"] == "NovaMusicControls")
        saver = next(node for node in repaired["nodes"] if node["type"] == "NovaMusicSaveAudioMetadata")
        self.assertEqual([620, 760], controls["size"])
        self.assertEqual(44, len(controls["widgets_values"]))
        self.assertEqual(["Off", ""], controls["widgets_values"][-2:])
        self.assertEqual("WAV (24-bit)", saver["widgets_values"][-1])
        self.assertEqual(original_links, repaired["links"])

    def test_v460_migration_unifies_idea_repairs_height_and_preserves_links(self):
        migration_path = ROOT / "tools" / "migrate_music_workflow_v460.py"
        migration_spec = importlib.util.spec_from_file_location("novoloko_v460_migration", migration_path)
        migration = importlib.util.module_from_spec(migration_spec)
        assert migration_spec and migration_spec.loader
        migration_spec.loader.exec_module(migration)
        workflow = json.loads(
            (ROOT / "workflows" / "NovoLoko MiniMax Music 3 - Lab v4.5.1.json").read_text(encoding="utf-8")
        )
        controls = next(node for node in workflow["nodes"] if node["type"] == "NovaMusicControls")
        controls["size"][1] = 45_702_294
        migrated = migration.migrate(workflow)
        types = {node["type"] for node in migrated["nodes"]}
        self.assertNotIn("NovaMusicIdea", types)
        controls = next(node for node in migrated["nodes"] if node["type"] == "NovaMusicControls")
        saver = next(node for node in migrated["nodes"] if node["type"] == "NovaMusicSaveAudioMetadata")
        self.assertEqual([620, 760], controls["size"])
        self.assertEqual("idea", controls["inputs"][-1]["name"])
        self.assertEqual("music_idea", controls["outputs"][-2]["name"])
        self.assertEqual("controls_recipe_json", controls["outputs"][-1]["name"])
        self.assertTrue(any(link[1:5] == [controls["id"], 7, saver["id"], 15] for link in migrated["links"]))
        self.assertEqual("4.6.0", migrated["extra"]["novolokoMusicLabVersion"])

    def test_fun_hybrid_presets_extend_instead_of_replace_genre_coverage(self):
        presets = music3.load_music_presets()
        holy = presets["Gregorian Drill Opera / Holy 808"]
        self.assertEqual("Gregorian Drill Opera", holy["subgenre_era"])
        self.assertEqual("Pipe Organ, Cathedral Choir and Sliding 808s", holy["instruments"])
        catalog = music3.load_music_catalog()
        genre_names = {row["name"] for row in catalog["genre"]}
        self.assertTrue(
            {
                "Hip-Hop / Rap", "Electronic", "Pop", "R&B / Soul", "Rock", "Metal",
                "Orchestral / Cinematic", "Folk / Acoustic", "Jazz", "Reggae / Dancehall",
            }.issubset(genre_names)
        )

    def test_saver_writes_duplicate_safe_matched_batch_sidecars(self):
        import numpy as np

        reports = [
            "NovoLoko MiniMax Music 3 selections\nPreset: Gregorian Drill Opera / Holy 808\nRandomize all: Off\nSeed: 101\nGenre: Orchestral / Cinematic",
            "NovoLoko MiniMax Music 3 selections\nPreset: CUDA Out of Memory\nRandomize all: On\nSeed: 202\nGenre: Electronic",
        ]
        audio = {
            "waveform": np.zeros((2, 1, 800), dtype=np.float32),
            "sample_rate": 8000,
        }
        with tempfile.TemporaryDirectory() as temporary:
            output_root = Path(temporary)
            with patch.object(music3, "_output_root", return_value=output_root):
                result = music3.NovaMusicSaveAudioMetadata().save(
                    audio,
                    track_name="Holy:808?",
                    selected_options=json.dumps(reports),
                    original_idea=json.dumps(["sacred drill", "gpu comedy"]),
                    final_lyrics=json.dumps(["[Chorus]\nAmen", "[Chorus]\nRetry"]),
                    final_music_caption=json.dumps(["Global Metadata: sacred", "Global Metadata: industrial"]),
                    stacker_seed=[101, 202],
                    generation_seed=[1001, 2002],
                )
                second = music3.NovaMusicSaveAudioMetadata().save(
                    {"waveform": audio["waveform"][:1], "sample_rate": 8000},
                    track_name="Holy:808?",
                    selected_options=reports[0],
                )

            folder = output_root / "audio" / "NovoLoko"
            expected = {
                "NovoLoko_Holy_808_0001.wav", "NovoLoko_Holy_808_0001.txt", "NovoLoko_Holy_808_0001.json",
                "NovoLoko_Holy_808_0002.wav", "NovoLoko_Holy_808_0002.txt", "NovoLoko_Holy_808_0002.json",
                "NovoLoko_Holy_808_0003.wav", "NovoLoko_Holy_808_0003.txt", "NovoLoko_Holy_808_0003.json",
            }
            self.assertEqual(expected, {path.name for path in folder.iterdir()})
            first = json.loads((folder / "NovoLoko_Holy_808_0001.json").read_text(encoding="utf-8"))
            paired = json.loads((folder / "NovoLoko_Holy_808_0002.json").read_text(encoding="utf-8"))
            self.assertEqual("sacred drill", first["original_idea"])
            self.assertEqual(music3.TRACK_SCHEMA, first["schema"])
            self.assertEqual("sacred drill", first["controls_recipe"]["original_idea"])
            self.assertEqual("Gregorian Drill Opera / Holy 808", first["preset"])
            self.assertEqual(1001, first["generation_seed"])
            self.assertEqual("gpu comedy", paired["original_idea"])
            self.assertEqual("CUDA Out of Memory", paired["preset"])
            self.assertEqual(2002, paired["generation_seed"])
            self.assertIn(b"LIST", (folder / "NovoLoko_Holy_808_0001.wav").read_bytes())
            self.assertIn("FINAL STRUCTURED LYRICS", (folder / "NovoLoko_Holy_808_0001.txt").read_text(encoding="utf-8"))
            self.assertIn("Saved 2 matched NovoLoko track set(s)", result["result"][1])
            self.assertIn("Save stage", result["result"][1])
            self.assertIn("cleanup stage", result["result"][1])
            self.assertIn("NovoLoko_Holy_808_0003.wav", second["result"][1])

    def test_saver_cleanup_is_explicit_and_folder_traversal_is_rejected(self):
        import numpy as np

        audio = {"waveform": np.zeros((1, 1, 80), dtype=np.float32), "sample_rate": 8000}
        with tempfile.TemporaryDirectory() as temporary:
            with patch.object(music3, "_output_root", return_value=Path(temporary)):
                with self.assertRaises(ValueError):
                    music3.NovaMusicSaveAudioMetadata().save(audio, folder_prefix="../outside")
                with patch.object(music3, "_cleanup_music_models", return_value="cleanup called") as cleanup:
                    output = music3.NovaMusicSaveAudioMetadata().save(
                        audio,
                        save_txt=False,
                        save_json=False,
                        cleanup_after_generation=True,
                    )
                    cleanup.assert_called_once_with()
                    self.assertIn("cleanup called", output["result"][1])
                with patch.object(music3, "_cleanup_music_models", return_value="one-off cleanup") as cleanup:
                    output = music3.NovaMusicSaveAudioMetadata().save(
                        audio, save_txt=False, save_json=False,
                        cleanup_after_generation=False,
                        model_lifecycle="One-off: clean after run",
                    )
                    cleanup.assert_called_once_with()
                    self.assertIn("lifecycle One-off: clean after run", output["result"][1])
                with patch.object(music3, "_cleanup_music_models") as cleanup:
                    music3.NovaMusicSaveAudioMetadata().save(
                        audio, save_txt=False, save_json=False,
                        cleanup_after_generation=True,
                        model_lifecycle="Batch: keep loaded",
                    )
                    cleanup.assert_not_called()

    def test_saver_exposes_and_writes_each_supported_audio_extension(self):
        import numpy as np

        schema = music3.NovaMusicSaveAudioMetadata.INPUT_TYPES()["required"]
        self.assertEqual(list(music3.AUDIO_FORMATS), schema["audio_format"][0])
        audio = {"waveform": np.zeros((1, 1, 80), dtype=np.float32), "sample_rate": 8000}

        def fake_transcode(source, destination, _audio_format):
            self.assertTrue(source.is_file())
            destination.write_bytes(b"encoded audio")

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with patch.object(music3, "_output_root", return_value=root), patch.object(
                music3, "_transcode_audio", side_effect=fake_transcode
            ):
                for audio_format, (extension, _args) in music3.AUDIO_FORMATS.items():
                    music3.NovaMusicSaveAudioMetadata().save(
                        audio,
                        track_name="Formats",
                        save_txt=False,
                        save_json=False,
                        audio_format=audio_format,
                    )
            names = {path.name for path in (root / "audio" / "NovoLoko").iterdir()}
            self.assertEqual(
                {"NovoLoko_Formats_0001.wav", "NovoLoko_Formats_0002.flac", "NovoLoko_Formats_0003.mp3", "NovoLoko_Formats_0004.ogg"},
                names,
            )

    def test_user_presets_are_update_safe_and_store_resolved_choices(self):
        saved = music3.save_user_music_preset(
            "My Cold Custom",
            preset=music3.CUSTOM_PRESET,
            seed=123,
            genre=music3.RANDOM_OPTION,
            mood=music3.CUSTOM_OPTION,
            custom_mood="frozen sunrise",
            allow_random_none=True,
            random_preset_scope="Off",
            random_preset_filter="Rock",
        )
        self.assertNotEqual(music3.RANDOM_OPTION, saved["selections"]["genre"])
        self.assertEqual(music3.CUSTOM_OPTION, saved["selections"]["mood"])
        self.assertEqual("frozen sunrise", saved["custom_values"]["mood"])
        self.assertTrue(saved["allow_random_none"])
        self.assertEqual("Off", saved["random_preset_scope"])
        self.assertEqual("Rock", saved["random_preset_filter"])
        self.assertEqual(123, saved["seed"])
        scoped = music3.save_user_music_preset(
            "My Scoped Random",
            preset=music3.CUSTOM_PRESET,
            seed=321,
            random_preset_scope="Genre",
            random_preset_filter="Rock",
        )
        self.assertEqual("Genre", scoped["random_preset_scope"])
        self.assertEqual("Rock", scoped["random_preset_filter"])
        self.assertTrue((Path(self.user_data.name) / "music3" / "user_presets.json").is_file())
        self.assertIn("My Cold Custom", music3.load_music_presets())
        renamed = music3.rename_user_music_preset("My Cold Custom", "My Frozen Sunrise")
        self.assertEqual("My Frozen Sunrise", renamed["name"])
        self.assertEqual("My Frozen Sunrise", music3.delete_user_music_preset("My Frozen Sunrise"))
        self.assertNotIn("My Frozen Sunrise", music3.load_music_presets())

    def test_audio_library_lists_renames_and_recoverably_trashes_paired_sidecars(self):
        import numpy as np

        audio = {"waveform": np.zeros((1, 1, 800), dtype=np.float32), "sample_rate": 8000}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with patch.object(music3, "_output_root", return_value=root):
                music3.NovaMusicSaveAudioMetadata().save(audio, track_name="Player Test")
                library = music3.list_music_library("audio/NovoLoko", "newest", "Player")
                self.assertEqual(1, library["count"])
                track = library["tracks"][0]
                self.assertEqual(0.1, track["duration"])
                self.assertTrue(track["has_txt"] and track["has_json"])
                self.assertFalse(track["favorite"])
                favorited = music3.set_music_library_favorite("audio/NovoLoko", track["name"], True)
                self.assertTrue(favorited["favorite"])
                self.assertTrue(music3.list_music_library("audio/NovoLoko", "favorites")["tracks"][0]["favorite"])
                self.assertEqual(1, music3.list_music_library("audio/NovoLoko", "newest", "", True)["count"])
                favorites_path = root / "audio" / "NovoLoko" / music3.FAVORITES_INDEX_NAME
                self.assertTrue(favorites_path.is_file())
                renamed = music3.rename_music_library_track(
                    "audio/NovoLoko", track["name"], "Renamed Track"
                )
                self.assertEqual("Renamed_Track.wav", renamed["track"]["name"])
                self.assertEqual(
                    ["Renamed_Track.wav"],
                    json.loads(favorites_path.read_text(encoding="utf-8"))["favorites"],
                )
                folder = root / "audio" / "NovoLoko"
                self.assertTrue((folder / "Renamed_Track.txt").is_file())
                json_path = folder / "Renamed_Track.json"
                record = json.loads(json_path.read_text(encoding="utf-8"))
                record.pop("controls_recipe", None)
                record["schema"] = "novoloko.minimax_music3.track.v1"
                record["preset"] = "A retired preset"
                record["stacker_seed"] = "18446744073709551615"
                record["final_structured_lyrics"] = "[Verse 1]\nOld song, new recipe"
                record["stacker_selections"] = {
                    "Preset": "A retired preset",
                    "Random can choose None": "On",
                    "Seed": "18446744073709551615",
                    "Genre": "Random -> Rock",
                    "Mood": "Custom... midnight chrome",
                }
                json_path.write_text(json.dumps(record), encoding="utf-8")
                sidecar = music3.load_music_library_sidecar(
                    "audio/NovoLoko", "Renamed_Track.wav"
                )
                self.assertEqual(music3.CUSTOM_PRESET, sidecar["recipe"]["preset"])
                self.assertEqual("A retired preset", sidecar["recipe"]["source_preset"])
                self.assertEqual(18446744073709551615, sidecar["recipe"]["seed"])
                self.assertEqual(music3.RANDOM_OPTION, sidecar["recipe"]["selections"]["genre"])
                self.assertEqual("Rock", sidecar["recipe"]["resolved_selections"]["genre"])
                self.assertEqual(music3.CUSTOM_OPTION, sidecar["recipe"]["selections"]["mood"])
                self.assertEqual("midnight chrome", sidecar["recipe"]["custom_values"]["mood"])
                self.assertTrue(sidecar["recipe"]["allow_random_none"])
                self.assertIn("Old song", sidecar["lyrics"])
                with patch.object(music3.subprocess, "Popen") as explorer:
                    revealed = music3.reveal_music_library_track(
                        "audio/NovoLoko", "Renamed_Track.wav"
                    )
                    self.assertEqual("Renamed_Track.wav", revealed["name"])
                    explorer.assert_called_once()
                    self.assertIn("/select,", explorer.call_args.args[0][1])
                trashed = music3.trash_music_library_track("audio/NovoLoko", "Renamed_Track.wav")
                self.assertTrue(Path(trashed["trash_folder"]).is_dir())
                self.assertEqual([], list(folder.glob("Renamed_Track.*")))
                self.assertEqual([], json.loads(favorites_path.read_text(encoding="utf-8"))["favorites"])

    def test_frontend_contains_focus_gated_text_scroll_timer_defaults_and_writer_migration(self):
        source = (ROOT / "web" / "nova_core_nodes.js").read_text(encoding="utf-8")
        self.assertIn("nativeWheelWhen: textOwnsWheel", source)
        self.assertIn('"overflow-y:scroll"', source)
        self.assertIn("event.stopImmediatePropagation()", source)
        self.assertIn("content.scrollTop += delta", source)
        self.assertIn("event.preventDefault()", source)
        self.assertIn('cornerRadius: 5', source)
        self.assertIn('glow: false', source)
        self.assertIn('Custom: 05 SFX/01 Pack 100/008 - Cash.mp3', source)
        self.assertIn('legacyZeroOnePair', source)
        self.assertIn("installFocusedSeedWheelSupport", source)
        self.assertIn("nodeSelected(node)", source)
        self.assertIn("normaliseEnhancerComboWidget", source)
        self.assertIn("novaEnhancerLastTaskMode", source)
        self.assertIn("resolveComboChoice(value, choices", source)
        for node_name in (
            "NovaMusicLyricEnhancer", "NovaMusicLyricsGenerator", "NovaMusicCaptionEnhancer",
        ):
            self.assertIn(node_name, source)

        player = (ROOT / "web" / "nova_music3.js").read_text(encoding="utf-8")
        for expected in (
            "Auto-play new", "Repeat", "Shuffle", "Rename Selected",
            "Move Selected to Trash", "Show Selected in Folder",
            "/nova_music3/library/browse", "/nova_music3/library/reveal",
            "installResponsivePanel(node, dom, root",
            "VISUALIZER_STYLES", "createAnalyser", "detectBeat(frequencies)",
            "novaMusicVisualizerHeight", "Search Pearl Jam",
            "All preset folders", "presetEntrySearchText",
            "Load Track Recipe", "/nova_music3/library/sidecar",
            "Estimated Karaoke On", "novaMusicShowLyrics",
            "__novaMusic3ApplyRecipe", "drawVisualizer(!audio.paused && !audio.ended)",
            "SONG IDEA", "MUSIC_TIMING_LABELS", "novaMusicStageTimings",
            "booleanValue(recipe.randomize_all", "comboValue(choiceWidget",
            "Randomize Seed", "allCategoriesVisible", "novaMusic3RepairControlWidgets",
            "/nova_music3/ollama/models", "Advanced / custom model",
            "/nova_music3/library/favorite", "Favorites only", "novaMusicLyricsHeight",
            "Writer/model lifecycle",
        ):
            self.assertIn(expected, player)
        self.assertNotIn("new ResizeObserver(() => drawVisualizer(false))", player)

    def test_enhancer_nodes2_combo_indexes_resolve_to_saved_names(self):
        result = subprocess.run(
            [
                "node",
                str(ROOT / "tests/js/nova_enhancer_combo_state.test.mjs"),
                str(ROOT / "web/nova_core_nodes.js"),
            ],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
