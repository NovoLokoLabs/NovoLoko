from __future__ import annotations

import importlib
import sys
import types
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = "novoloko_media_history_runtime_tests"


def load_modules():
    package = sys.modules.get(PACKAGE)
    if package is None:
        package = types.ModuleType(PACKAGE)
        package.__path__ = [str(ROOT)]
        sys.modules[PACKAGE] = package
    voice = importlib.import_module(f"{PACKAGE}.voice_nodes")
    runtime = importlib.import_module(f"{PACKAGE}.media_history_runtime")
    return voice, runtime


class MediaHistoryRuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.voice, cls.runtime = load_modules()

    def tearDown(self) -> None:
        try:
            delattr(self.runtime._EXECUTION_CONTEXT, "media_studio_save")
        except AttributeError:
            pass

    def test_history_route_behavior_is_unchanged_outside_node_execution(self) -> None:
        with mock.patch.object(self.runtime, "_ORIGINAL_HISTORY_ENTRIES", return_value=[{"filename": "old.wav"}]) as history:
            result = self.voice._audio_history_entries(1000)
        history.assert_called_once_with(1000)
        self.assertEqual([{"filename": "old.wav"}], result)

    def test_node_execution_skips_only_the_redundant_inline_history_scan(self) -> None:
        def original_save(_self, *args, **kwargs):
            return {
                "ui": {
                    "nova_audio_latest": [{"filename": "new.wav"}],
                    "nova_audio_history": self.voice._audio_history_entries(1000),
                },
                "result": (),
            }

        with (
            mock.patch.object(self.runtime, "_ORIGINAL_SAVE_AND_SHOW", side_effect=original_save),
            mock.patch.object(self.runtime, "_ORIGINAL_HISTORY_ENTRIES", return_value=[{"filename": "old.wav"}]) as history,
        ):
            result = self.voice.NovaAudioHistoryPlayer().save_and_show()
            outside = self.voice._audio_history_entries(1000)

        self.assertEqual([], result["ui"]["nova_audio_history"])
        self.assertEqual("new.wav", result["ui"]["nova_audio_latest"][0]["filename"])
        self.assertEqual([{"filename": "old.wav"}], outside)
        history.assert_called_once_with(1000)

    def test_execution_flag_is_cleared_after_failure(self) -> None:
        def fail(_self, *args, **kwargs):
            self.assertEqual([], self.voice._audio_history_entries(1000))
            raise RuntimeError("test failure")

        with (
            mock.patch.object(self.runtime, "_ORIGINAL_SAVE_AND_SHOW", side_effect=fail),
            mock.patch.object(self.runtime, "_ORIGINAL_HISTORY_ENTRIES", return_value=[{"filename": "old.wav"}]),
        ):
            with self.assertRaisesRegex(RuntimeError, "test failure"):
                self.voice.NovaAudioHistoryPlayer().save_and_show()
            self.assertEqual([{"filename": "old.wav"}], self.voice._audio_history_entries(1000))


if __name__ == "__main__":
    unittest.main()
