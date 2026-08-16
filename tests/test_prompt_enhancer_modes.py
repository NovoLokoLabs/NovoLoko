from __future__ import annotations

import importlib.util
import sys
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PACKAGE_NAME = "novoloko_prompt_enhancer_test"


def load_core_module():
    package = types.ModuleType(PACKAGE_NAME)
    package.__path__ = [str(ROOT)]
    sys.modules.setdefault(PACKAGE_NAME, package)
    module_name = f"{PACKAGE_NAME}.nova_core_nodes"
    spec = importlib.util.spec_from_file_location(module_name, ROOT / "nova_core_nodes.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


core = load_core_module()


class RecordingClip:
    def __init__(self, output="enhanced H3 prompt"):
        self.instruction = ""
        self.skip_template = None
        self.generation_args = {}
        self.output = output

    def tokenize(self, instruction, **kwargs):
        self.instruction = instruction
        self.skip_template = kwargs.get("skip_template")
        return [1]

    def generate(self, _tokens, **kwargs):
        self.generation_args = kwargs
        return [2]

    def decode(self, _generated_ids):
        return self.output


class PromptEnhancerModeTests(unittest.TestCase):
    def setUp(self):
        core.NovaPromptEnhancer._fixed_seed_cache.clear()
        self.enhancer = core.NovaPromptEnhancer()

    def test_new_widgets_are_appended_after_existing_optional_widgets(self):
        optional_names = list(self.enhancer.INPUT_TYPES()["optional"])
        self.assertEqual(
            optional_names,
            ["image", "custom_instructions", "task_mode", "h3_length_behavior"],
        )

    def test_auto_detection_for_all_h3_structures_and_image_fallback(self):
        cases = {
            "integrated_multimodal_description: a tracked shot": "H3 Standard",
            "overall_soundscape: ocean wind": "H3 Standard",
            "non_diegetic_music: none": "H3 Standard",
            "subject_definitions: <Subject 1> is the hero": "H3 Full Reference",
            "retention_analysis: keep the red coat": "H3 Full Reference",
            "detailed_description: <Picture 1> at dawn": "H3 Full Reference",
            "SCENE 1 - ARRIVAL": "H3 Director",
            "HANDOFF TO NEXT SCENE: hold the pose": "H3 Director",
            "CONTINUE FROM PREVIOUS SCENE: same camera axis": "H3 Director",
            "FINAL SHOT: crane upward": "H3 Director",
            "portrait of a lighthouse at sunset": "Image",
        }
        for prompt, expected in cases.items():
            with self.subTest(prompt=prompt):
                self.assertEqual(self.enhancer._resolve_task_mode(prompt, "Auto"), expected)

    def test_target_model_choices_and_legacy_values_resolve_compatibly(self):
        choices = self.enhancer.INPUT_TYPES()["optional"]["task_mode"][0]
        self.assertEqual(
            choices,
            [
                "Auto",
                "Krea2 / Image",
                "MiniMax H3 Standard",
                "MiniMax H3 Full Reference",
                "MiniMax H3 Director",
            ],
        )
        self.assertEqual(self.enhancer._resolve_task_mode("SCENE 1", "Image"), "Image")
        self.assertEqual(
            self.enhancer._resolve_task_mode("plain text", "H3 Standard"),
            "H3 Standard",
        )
        self.assertEqual(
            self.enhancer._resolve_task_mode("plain text", "MiniMax H3 Director"),
            "H3 Director",
        )

    def test_director_detection_wins_over_other_h3_markers(self):
        prompt = "integrated_multimodal_description: start\nSCENE 1 - OPENING"
        self.assertEqual(self.enhancer._resolve_task_mode(prompt, "Auto"), "H3 Director")

    def test_h3_core_omits_image_core_and_appends_custom_instructions(self):
        prompt = "subject_definitions: <Subject 1>\ndetailed_description: <Picture 1>"
        instruction = self.enhancer._instruction(
            prompt,
            "Faithful Rich Image",
            "Rich",
            False,
            "Keep the chosen CSV camera move.",
            "H3 Full Reference",
            "Preserve",
        )
        self.assertTrue(instruction.startswith("MODE: H3 FULL REFERENCE\n"))
        self.assertNotIn("Produce exactly ONE finished image-generation prompt", instruction)
        self.assertNotIn("Aim for roughly 150 to 320 words", instruction)
        self.assertIn("<Picture N>", instruction)
        self.assertIn("<Subject N>", instruction)
        self.assertIn("<Video N>", instruction)
        self.assertIn("<Audio N>", instruction)
        self.assertGreater(
            instruction.index("CUSTOM INSTRUCTIONS"),
            instruction.index("PRESERVATION RULES"),
        )

    def test_image_mode_keeps_original_image_core(self):
        instruction = self.enhancer._instruction(
            "a lighthouse",
            "Faithful Rich Image",
            "Rich",
            False,
            "",
            "Image",
            "Preserve",
        )
        self.assertTrue(instruction.startswith("MODE: IMAGE\n"))
        self.assertIn("Produce exactly ONE finished image-generation prompt", instruction)
        self.assertIn("Aim for roughly 150 to 320 words", instruction)

    def test_missing_new_mode_input_keeps_legacy_aio_on_krea2_image_core(self):
        _enhanced, instructions_used, status = self.enhancer.enhance(
            RecordingClip("polished lighthouse image prompt"),
            idea="a lighthouse",
        )
        self.assertTrue(instructions_used.startswith("MODE: IMAGE\n"))
        self.assertIn("Produce exactly ONE finished image-generation prompt", instructions_used)
        self.assertIn("Faithful Rich Image", status)

    def test_false_default_template_does_not_select_image_core_for_h3(self):
        clip = RecordingClip()
        _enhanced, instructions_used, status = self.enhancer.enhance(
            clip,
            idea="overall_soundscape: rain\nnon_diegetic_music: none",
            preset="Faithful Rich Image",
            detail_level="Rich",
            creativity=0.3,
            max_length=12000,
            use_default_template=False,
            custom_instructions="Preserve the exact audio timing.",
            task_mode="Auto",
            h3_length_behavior="Preserve",
        )
        self.assertTrue(instructions_used.startswith("MODE: H3 STANDARD\n"))
        self.assertNotIn("Produce exactly ONE finished image-generation prompt", instructions_used)
        self.assertTrue(clip.skip_template)
        self.assertEqual(clip.generation_args["temperature"], 0.3)
        self.assertEqual(clip.generation_args["max_length"], 12000)
        self.assertIn("Auto detected H3 Standard", status)

    def test_h3_safety_fallback_blocks_changed_selected_options(self):
        source = (
            "H3 STANDARD PROMPT\n\n"
            "CORE ACTION: Give <Subject 1> a sad expression, dress <Subject 1> in a slip "
            "bodysuit, and use High Lunge Pose. Use <Picture 1> as the identity reference.\n\n"
            "integrated_multimodal_description: Hold the selected pose during a full orbit.\n\n"
            "overall_soundscape: None\n\n"
            "non_diegetic_music: None\n\n"
            "SELECTED H3 DIRECTION:\n- Keep High Lunge Pose fixed."
        )
        destructive = (
            "H3 STANDARD PROMPT\n\n"
            "CORE ACTION: Give <Subject 1> a neutral expression, dress <Subject 1> in an "
            "overbust corset, and use Heron Pose. Use <Picture 1> as the identity reference.\n\n"
            "integrated_multimodal_description: Hold Heron Pose during a full orbit.\n\n"
            "overall_soundscape: None\n\n"
            "non_diegetic_music: None\n\n"
            "SELECTED H3 DIRECTION:\n- Keep Heron Pose fixed."
        )
        enhanced, instructions_used, status = self.enhancer.enhance(
            RecordingClip(destructive),
            idea=source,
            creativity=0.3,
            max_length=12000,
            task_mode="Auto",
            h3_length_behavior="Preserve",
        )
        self.assertEqual(enhanced, source)
        self.assertTrue(instructions_used.startswith("MODE: H3 STANDARD\n"))
        self.assertIn("H3 safety fallback preserved the original", status)
        self.assertIn("selected fixed pose: High Lunge Pose", status)
        self.assertIn("selected garment: slip bodysuit", status)
        self.assertIn("selected expression: sad expression", status)

    def test_h3_safety_gate_accepts_a_compliant_rewrite(self):
        source = (
            "H3 STANDARD PROMPT\n\n"
            "CORE ACTION: Keep <Subject 1> in High Lunge Pose using <Picture 1>.\n\n"
            "integrated_multimodal_description: A clear opening shot.\n\n"
            "overall_soundscape: None\n\n"
            "non_diegetic_music: None"
        )
        compliant = source + "\n\nCAMERA NOTE: Use a physically coherent, steady orbit."
        enhanced, _instructions_used, status = self.enhancer.enhance(
            RecordingClip(compliant),
            idea=source,
            task_mode="MiniMax H3 Standard",
            h3_length_behavior="Detailed",
        )
        self.assertEqual(enhanced, compliant)
        self.assertNotIn("safety fallback", status)

    def test_h3_safety_allows_rewritten_field_values_and_direction(self):
        source = (
            "H3 STANDARD PROMPT\n\n"
            "CORE ACTION: Give <Subject 1> a sad expression. Use <Picture 1>.\n\n"
            "integrated_multimodal_description: A rough orbit description.\n\n"
            "overall_soundscape: None\n\n"
            "non_diegetic_music: None\n\n"
            "SELECTED H3 DIRECTION:\n- Add a restrained ambient score."
        )
        rewritten = (
            "H3 STANDARD PROMPT\n\n"
            "CORE ACTION: Keep <Subject 1>'s sad expression visible, using <Picture 1> for identity.\n\n"
            "integrated_multimodal_description: The camera completes a smooth, readable orbit "
            "while the subject remains physically stable.\n\n"
            "overall_soundscape: Quiet room tone supports the motion.\n\n"
            "non_diegetic_music: A restrained ambient score builds gradually.\n\n"
            "SELECTED H3 DIRECTION:\n- The ambient score remains restrained and vocal-free."
        )
        enhanced, _instructions_used, status = self.enhancer.enhance(
            RecordingClip(rewritten),
            idea=source,
            task_mode="MiniMax H3 Standard",
            h3_length_behavior="Preserve",
        )
        self.assertEqual(enhanced, rewritten)
        self.assertNotIn("safety fallback", status)

    def test_h3_safety_blocks_non_text_model_failure(self):
        source = "integrated_multimodal_description: A readable camera move around <Subject 1>."
        enhanced, _instructions_used, status = self.enhancer.enhance(
            RecordingClip("," * 4000),
            idea=source,
            task_mode="MiniMax H3 Standard",
        )
        self.assertEqual(enhanced, source)
        self.assertIn("unreadable or non-text output", status)

    def test_h3_omitted_selected_direction_is_restored_without_losing_rewrite(self):
        source = (
            "H3 STANDARD PROMPT\n\n"
            "integrated_multimodal_description: A rough orbit.\n\n"
            "overall_soundscape: Clean room tone.\n\n"
            "non_diegetic_music: None.\n\n"
            "SELECTED H3 DIRECTION:\n- Add a restrained ambient score with no vocals."
        )
        model_output = (
            "H3 STANDARD PROMPT\n\n"
            "integrated_multimodal_description: The camera completes a smooth, coherent orbit.\n\n"
            "overall_soundscape: Clean room tone supports the movement.\n\n"
            "non_diegetic_music: A restrained ambient score builds without vocals."
        )
        enhanced, _instructions_used, status = self.enhancer.enhance(
            RecordingClip(model_output),
            idea=source,
            task_mode="MiniMax H3 Standard",
        )
        self.assertIn("The camera completes a smooth, coherent orbit", enhanced)
        self.assertIn("SELECTED H3 DIRECTION:", enhanced)
        self.assertIn("Add a restrained ambient score with no vocals", enhanced)
        self.assertIn("restored protected H3 sections: SELECTED H3 DIRECTION", status)
        self.assertNotIn("safety fallback", status)


if __name__ == "__main__":
    unittest.main()
