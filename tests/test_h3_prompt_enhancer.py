from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_module():
    name = "novoloko_h3_prompt_enhancer_test"
    spec = importlib.util.spec_from_file_location(name, ROOT / "h3_prompt_enhancer.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class H3PromptEnhancerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_module()

    def test_all_dropdowns_are_bundled_and_have_readable_choices(self):
        schema = self.module.NovaH3PromptEnhancer.INPUT_TYPES()
        self.assertEqual(schema["required"]["mode"][0], self.module.MODES)
        self.assertTrue(schema["required"]["raw_prompt"][1]["multiline"])
        for key, _label in self.module.FIELDS:
            choices = schema["required"][key][0]
            self.assertEqual(choices[0], self.module.NONE_CHOICE)
            self.assertGreaterEqual(len(choices), 8)
            override = schema["optional"][f"{key}_override"]
            self.assertTrue(override[1]["forceInput"])

    def test_disconnected_optional_overrides_never_error(self):
        node = self.module.NovaH3PromptEnhancer()
        result = node.enhance(mode="Auto", raw_prompt="A woman walks through a studio")
        final_prompt, selected_options, detected_mode = result["result"]
        self.assertEqual(detected_mode, "Standard H3")
        self.assertIn("A woman walks through a studio", final_prompt)
        self.assertEqual(json.loads(selected_options)["detected_mode"], "Standard H3")

    def test_non_empty_override_replaces_only_its_dropdown_sentence(self):
        node = self.module.NovaH3PromptEnhancer()
        override = "Keep the custom pose sentence exactly as supplied."
        result = node.enhance(
            mode="Standard H3",
            raw_prompt="Studio portrait",
            pose="Warrior II Pose",
            clothing="Tailored Evening Suit",
            pose_override=override,
            clothing_override="",
        )
        final_prompt, selected_options, _mode = result["result"]
        options = json.loads(selected_options)["selections"]
        self.assertIn(override, final_prompt)
        self.assertNotIn("Use Warrior II", final_prompt)
        self.assertIn("precisely tailored evening suit", final_prompt)
        self.assertEqual(options["pose"]["source"], "override")
        self.assertEqual(options["clothing"]["source"], "dropdown")

    def test_auto_detects_director_and_full_reference_modes(self):
        node = self.module.NovaH3PromptEnhancer()
        director = node.enhance(mode="Auto", raw_prompt="Scene 1: enter | Scene 2: turn")["result"]
        reference = node.enhance(mode="Auto", raw_prompt="Use Video 1 for motion transfer")["result"]
        self.assertEqual(director[2], "Director 4 Scenes")
        self.assertIn("Scene 4:", director[0])
        self.assertEqual(reference[2], "Full Reference / Video Edit")

    def test_csv_snippets_remain_complete_verbatim_sentences(self):
        for key, _label in self.module.FIELDS:
            names, prompts = self.module._read_library(key)
            self.assertGreater(len(names), 1)
            for name in names[1:]:
                prompt = prompts[name]
                self.assertTrue(prompt.endswith("."), (key, name, prompt))


if __name__ == "__main__":
    unittest.main()
