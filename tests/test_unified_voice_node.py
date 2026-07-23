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
        self.assertEqual("Off", off[4])
        self.assertEqual("OmniLoko", disabled[4])
        self.assertEqual("silence", off[0])

    def test_backend_failure_never_cross_falls_back(self) -> None:
        kokoro = type("KokoroBackend", (_Backend,), {"calls": [], "error": None})
        omni = type("OmniBackend", (_Backend,), {"calls": [], "error": RuntimeError("bridge unavailable")})
        with mock.patch.object(self.module, "NovaOmniLokoTTS", omni), mock.patch.object(self.module, "NovaKokoroTTS", kokoro):
            with self.assertRaisesRegex(RuntimeError, "bridge unavailable"):
                self.module.NovaVoiceEngineTTS().speak(text="hello", engine="OmniLoko")
        self.assertEqual(1, len(omni.calls))
        self.assertEqual([], kokoro.calls)

    def test_registration_keeps_all_three_voice_nodes(self) -> None:
        package_name = "novoloko_unified_complete_tests"
        spec = importlib.util.spec_from_file_location(
            package_name, ROOT / "__init__.py", submodule_search_locations=[str(ROOT)]
        )
        package = importlib.util.module_from_spec(spec)
        sys.modules[package_name] = package
        spec.loader.exec_module(package)
        self.assertTrue(
            {"NovaKokoroTTS", "NovaOmniLokoTTS", "NovaVoiceEngineTTS"}.issubset(package.NODE_CLASS_MAPPINGS)
        )
        self.assertEqual("NovoLoko Voice TTS", package.NODE_DISPLAY_NAME_MAPPINGS["NovaVoiceEngineTTS"])
        self.assertEqual(33, len(package.NODE_CLASS_MAPPINGS))


if __name__ == "__main__":
    unittest.main()
