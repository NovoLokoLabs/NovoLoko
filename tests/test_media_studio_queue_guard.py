from __future__ import annotations

import importlib
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = "novoloko_media_guard_tests"


def load_guard():
    package = sys.modules.get(PACKAGE)
    if package is None:
        package = types.ModuleType(PACKAGE)
        package.__path__ = [str(ROOT)]
        sys.modules[PACKAGE] = package
    voice = importlib.import_module(f"{PACKAGE}.voice_nodes")
    guard = importlib.import_module(f"{PACKAGE}.media_studio_guard")
    return voice, guard


class MediaStudioQueueGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.voice, cls.guard = load_guard()

    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        folder_paths = types.ModuleType("folder_paths")
        folder_paths.get_output_directory = lambda: self.temp.name
        self.folder_patch = mock.patch.dict(sys.modules, {"folder_paths": folder_paths})
        self.folder_patch.start()

    def tearDown(self) -> None:
        self.folder_patch.stop()
        self.temp.cleanup()

    def test_history_metadata_omits_large_workflow_and_prompt_payloads(self) -> None:
        result = self.guard._safe_metadata({
            "workflow": "w" * 100_000,
            "prompt": "p" * 100_000,
            "label": "hello",
        })
        self.assertNotIn("workflow", result)
        self.assertNotIn("prompt", result)
        self.assertEqual("hello", result["label"])
        self.assertEqual("true", result["nova_media_studio_history_copy"])

    def test_history_payload_is_bounded_and_text_is_truncated(self) -> None:
        source = [{"label": "x" * 20_000} for _ in range(500)]
        with mock.patch.object(self.guard, "_ORIGINAL_HISTORY_ENTRIES", return_value=source) as original:
            result = self.guard._bounded_history_entries(1000)
        original.assert_called_once_with(200)
        self.assertEqual(500, len(result))
        self.assertEqual(8000, len(result[0]["label"]))

    def test_legacy_original_history_copy_uses_safe_cap_and_atomic_replace(self) -> None:
        image = np.zeros((10, 5000, 3), dtype=np.float32)
        result = self.guard._fast_save_history_image(image, "wide", 0, {"label": "test"})
        saved = Path(self.voice._nova_audio_image_dir()) / "wide.png"
        self.assertTrue(saved.is_file())
        self.assertFalse(saved.with_suffix(saved.suffix + ".tmp").exists())
        with Image.open(saved) as decoded:
            self.assertEqual((4096, 8), decoded.size)
        self.assertTrue(result["capped"])
        self.assertEqual(5000, result["source_width"])
        self.assertEqual(4096, result["saved_width"])

    def test_media_studio_defaults_are_small_and_history_limit_is_capped(self) -> None:
        definition = self.voice.NovaAudioHistoryPlayer.INPUT_TYPES()
        history_limit = definition["required"]["history_limit"][1]
        resolution = definition["optional"]["history_image_resolution"][1]
        self.assertEqual(100, history_limit["default"])
        self.assertEqual(200, history_limit["max"])
        self.assertEqual("2048 max", resolution["default"])


if __name__ == "__main__":
    unittest.main()
