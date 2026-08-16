from __future__ import annotations

import importlib
import sys
import types
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = "novoloko_unified_voice_tests"


def load_module():
    package = sys.modules.get(PACKAGE)
    if package is None:
        package = types.ModuleType(PACKAGE)
        package.__path__ = [str(ROOT)]
        sys.modules[PACKAGE] = package
    return importlib.import_module(f"{PACKAGE}.unified_voice_node")


class _Backend:
    calls = []
    result = ("audio", "spoken", "status", "voice")
    error = None

    def speak(self, **kwargs):
        type(self).calls.append(kwargs)
        if type(self).error:
            raise type(self).error
        return (*type(self).result[:3], kwargs.get("voice", type(self).result[3]))


class UnifiedVoiceNodeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.module = load_module()

    def setUp(self) -> None:
        _Backend.calls = []
        _Backend.error = None
        patcher = mock.patch.object(self.module, "_ensure_omniloko_running")
        self.ensure_omniloko = patcher.start()
        self.addCleanup(patcher.stop)

    def test_schema_and_output_order_are_stable(self) -> None:
        node = self.module.NovaVoiceEngineTTS
        self.assertEqual(
            ("audio", "spoken_text", "status", "voice_used", "engine_used"),
            node.RETURN_NAMES,
        )
        self.assertEqual(
            ["text", "engine", "enabled", "omniloko_voice", "kokoro_voice", "advanced"],
            list(node.INPUT_TYPES()["required"]),
        )
        self.assertEqual(
            ["prefix", "max_characters", "speed", "device", "normalize_loudness", "timeout_seconds"],
            list(node.INPUT_TYPES()["optional"]),
        )

    def test_omniloko_invokes_only_omniloko_and_reports_identity(self) -> None:
        kokoro = type("KokoroBackend", (_Backend,), {"calls": [], "error": None})
        omni = type("OmniBackend", (_Backend,), {"calls": [], "error": None})
        with mock.patch.object(self.module, "NovaOmniLokoTTS", omni), mock.patch.object(self.module, "NovaKokoroTTS", kokoro):
            result = self.module.NovaVoiceEngineTTS().speak(
                text="hello", engine="OmniLoko", omniloko_voice="Current OmniLoko Profile"
            )
        self.assertEqual(1, len(omni.calls))
        self.assertEqual([], kokoro.calls)
        self.ensure_omniloko.assert_called_once()
        self.assertEqual("Current OmniLoko Profile", result[3])
        self.assertEqual("OmniLoko", result[4])

    def test_kokoro_invokes_only_kokoro_and_reports_identity(self) -> None:
        kokoro = type("KokoroBackend", (_Backend,), {"calls": [], "error": None})
        omni = type("OmniBackend", (_Backend,), {"calls": [], "error": None})
        with mock.patch.object(self.module, "NovaOmniLokoTTS", omni), mock.patch.object(self.module, "NovaKokoroTTS", kokoro):
            result = self.module.NovaVoiceEngineTTS().speak(
                text="hello", engine="Kokoro", kokoro_voice="af_heart | Heart (US Female)"
            )
        self.assertEqual([], omni.calls)
        self.assertEqual(1, len(kokoro.calls))
        self.ensure_omniloko.assert_not_called()
        self.assertEqual("af_heart | Heart (US Female)", result[3])
        self.assertEqual("Kokoro", result[4])

    def test_off_and_disabled_invoke_neither_backend(self) -> None:
        kokoro = type("KokoroBackend", (_Backend,), {"calls": [], "error": None})
        omni = type("OmniBackend", (_Backend,), {"calls": [], "error": None})
        with (
            mock.patch.object(self.module, "NovaOmniLokoTTS", omni),
            mock.patch.object(self.module, "NovaKokoroTTS", kokoro),
            mock.patch.object(self.module, "_silent_audio", return_value="silence"),
        ):
            off = self.module.NovaVoiceEngineTTS().speak(text="hello", engine="Off")
            disabled = self.module.NovaVoiceEngineTTS().speak(text="hello", engine="OmniLoko", enabled=False)
        self.assertEqual([], omni.calls)
        self.assertEqual([], kokoro.calls)
        self.ensure_omniloko.assert_not_called()
        self.assertEqual("Off", off[4])
        self.assertEqual("OmniLoko", disabled[4])
        self.assertEqual("silence", off[0])

    def test_offline_saved_preset_passes_validation_before_disabled_or_autostart(self) -> None:
        node = self.module.NovaVoiceEngineTTS
        self.assertIs(True, node.VALIDATE_INPUTS(omniloko_voice="Jeremy Irons"))
        self.assertIsInstance(node.VALIDATE_INPUTS(omniloko_voice=""), str)

        with mock.patch.object(self.module, "_silent_audio", return_value="silence"):
            disabled = node().speak(
                text="ignored",
                engine="OmniLoko",
                enabled=False,
                omniloko_voice="Jeremy Irons",
            )
            off = node().speak(
                text="ignored",
                engine="Off",
                enabled=True,
                omniloko_voice="Jeremy Irons",
            )
        self.ensure_omniloko.assert_not_called()
        self.assertEqual("Jeremy Irons", disabled[3])
        self.assertEqual("Off", off[4])

    def test_backend_failure_never_cross_falls_back(self) -> None:
        kokoro = type("KokoroBackend", (_Backend,), {"calls": [], "error": None})
        omni = type("OmniBackend", (_Backend,), {"calls": [], "error": RuntimeError("bridge unavailable")})
        with mock.patch.object(self.module, "NovaOmniLokoTTS", omni), mock.patch.object(self.module, "NovaKokoroTTS", kokoro):
            with self.assertRaisesRegex(RuntimeError, "bridge unavailable"):
                self.module.NovaVoiceEngineTTS().speak(text="hello", engine="OmniLoko")
        self.assertEqual(1, len(omni.calls))
        self.assertEqual([], kokoro.calls)
        self.ensure_omniloko.assert_called_once()

    def test_empty_omniloko_text_does_not_open_the_app(self) -> None:
        kokoro = type("KokoroBackend", (_Backend,), {"calls": [], "error": None})
        omni = type("OmniBackend", (_Backend,), {"calls": [], "error": None})
        with mock.patch.object(self.module, "NovaOmniLokoTTS", omni), mock.patch.object(self.module, "NovaKokoroTTS", kokoro):
            self.module.NovaVoiceEngineTTS().speak(text="  ", engine="OmniLoko", prefix="")
        self.ensure_omniloko.assert_not_called()

    def test_registration_keeps_all_three_voice_nodes(self) -> None:
        package_name = "novoloko_unified_complete_tests"
        spec = importlib.util.spec_from_file_location(
            package_name, ROOT / "__init__.py", submodule_search_locations=[str(ROOT)]
        )
        package = importlib.util.module_from_spec(spec)
        sys.modules[package_name] = package
        spec.loader.exec_module(package)
        self.assertTrue(
            {
                "NovaKokoroTTS",
                "NovaOmniLokoTTS",
                "NovaVoiceEngineTTS",
                "NovaControlPanelSwitch",
            }.issubset(package.NODE_CLASS_MAPPINGS)
        )
        self.assertEqual("NovoLoko Voice TTS", package.NODE_DISPLAY_NAME_MAPPINGS["NovaVoiceEngineTTS"])
        self.assertEqual(48, len(package.NODE_CLASS_MAPPINGS))
        control = package.NODE_CLASS_MAPPINGS["NovaControlPanelSwitch"]
        self.assertEqual(
            ["tts_enabled", "enhancer_enabled"],
            list(control.INPUT_TYPES()["required"]),
        )
        self.assertEqual(
            ("tts_enabled", "enhancer_enabled", "status"),
            control.RETURN_NAMES,
        )
        self.assertEqual(
            (True, False, "TTS: On | Enhancer: Off"),
            control().switch(True, False),
        )


if __name__ == "__main__":
    unittest.main()
