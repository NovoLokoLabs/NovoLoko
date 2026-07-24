from __future__ import annotations

import contextlib
import hashlib
import importlib
import json
import sys
import tempfile
import threading
import types
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = "novoloko_v350_tests"


def load_voice_nodes():
    package = sys.modules.get(PACKAGE)
    if package is None:
        package = types.ModuleType(PACKAGE)
        package.__path__ = [str(ROOT)]
        sys.modules[PACKAGE] = package
    return importlib.import_module(f"{PACKAGE}.voice_nodes")


class _Backend:
    calls = []

    def speak(self, **kwargs):
        type(self).calls.append(kwargs)
        return ({"waveform": object(), "sample_rate": 24000}, kwargs["text"], "ok", kwargs["omniloko_voice"] if kwargs["engine"] == "OmniLoko" else kwargs["kokoro_voice"], kwargs["engine"])


class V350MediaVoiceCompareTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.voice = load_voice_nodes()

    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        folder_paths = types.ModuleType("folder_paths")
        folder_paths.get_output_directory = lambda: self.temp.name
        self.folder_patch = mock.patch.dict(sys.modules, {"folder_paths": folder_paths})
        self.folder_patch.start()
        _Backend.calls = []

    def tearDown(self) -> None:
        self.folder_patch.stop()
        self.temp.cleanup()

    def _entry(self, name: str, shared_image: str = "shared.png") -> tuple[Path, Path, Path]:
        audio_dir = Path(self.voice._nova_audio_output_dir())
        image_dir = Path(self.voice._nova_audio_image_dir())
        audio = audio_dir / name
        audio.write_bytes(b"RIFF-test")
        image = image_dir / shared_image
        image.write_bytes(b"image-pixels")
        metadata = audio.with_suffix(".json")
        metadata.write_text(json.dumps({
            "filename": name,
            "label": "spoken prompt",
            "manual_prompt": "manual prompt",
            "enhanced_prompt": "enhanced prompt",
            "negative_prompt": "negative",
            "prompt_source": "Enhanced",
            "prompt_stack_summary": "stack summary",
            "voice": "old voice",
            "image_filename": shared_image,
            "image_first_filename": shared_image,
            "image_second_filename": shared_image,
            "created": 1,
            "duration": 1,
            "has_audio": True,
            "media_only": False,
        }), encoding="utf-8")
        return audio, metadata, image

    def test_delete_current_removes_managed_audio_metadata_and_unshared_images(self) -> None:
        audio, metadata, image = self._entry("one.wav")
        result = self.voice._delete_history_entry("one.wav")
        self.assertFalse(audio.exists())
        self.assertFalse(metadata.exists())
        self.assertFalse(image.exists())
        self.assertEqual([], result["items"])

    def test_delete_current_preserves_images_referenced_by_another_entry(self) -> None:
        first_audio, first_metadata, image = self._entry("one.wav")
        second_audio, second_metadata, _ = self._entry("two.wav")
        result = self.voice._delete_history_entry("one.wav")
        self.assertFalse(first_audio.exists())
        self.assertFalse(first_metadata.exists())
        self.assertTrue(second_audio.exists())
        self.assertTrue(second_metadata.exists())
        self.assertTrue(image.exists())
        self.assertEqual(["shared.png"], result["preservedSharedImages"])

    def test_delete_rejects_traversal_and_absolute_paths(self) -> None:
        for value in ("../outside.wav", "C:" + "\\" + "outside.wav", "/tmp/outside.wav"):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    self.voice._delete_history_entry(value)

    def test_revoice_reuses_images_and_metadata_without_image_generation(self) -> None:
        _audio, _metadata, image = self._entry("original.wav")
        before_hash = hashlib.sha256(image.read_bytes()).hexdigest()
        unified = types.ModuleType(f"{PACKAGE}.unified_voice_node")
        unified.NovaVoiceEngineTTS = _Backend
        unified.KOKORO_DEFAULT_VOICE = "af_nova | NovoLoko (US Female)"
        bridge = types.ModuleType(f"{PACKAGE}.lokobridge_nodes")
        bridge.PROFILE_VOICE = "Current OmniLoko Profile"
        bridge._external_cancellation = contextlib.nullcontext
        with (
            mock.patch.dict(sys.modules, {
                f"{PACKAGE}.unified_voice_node": unified,
                f"{PACKAGE}.lokobridge_nodes": bridge,
            }),
            mock.patch.object(self.voice, "_write_history_audio", side_effect=lambda _audio, path: Path(path).write_bytes(b"RIFF-new") or 2.5),
            mock.patch.object(self.voice, "_save_history_image", side_effect=AssertionError("image generation must not run")),
        ):
            result = self.voice._revoice_history_entry({
                "filename": "original.wav",
                "promptSource": "Manual",
                "engine": "OmniLoko",
                "voice": "Current OmniLoko Profile",
            }, threading.Event())
        self.assertEqual(1, len(_Backend.calls))
        self.assertEqual("manual prompt", _Backend.calls[0]["text"])
        self.assertEqual("OmniLoko", result["engine"])
        self.assertEqual("negative", result["negative_prompt"])
        self.assertEqual("Enhanced", result["prompt_source"])
        self.assertEqual("Manual", result["revoice_prompt_source"])
        self.assertEqual("stack summary", result["prompt_stack_summary"])
        self.assertEqual("shared.png", result["image_first_filename"])
        self.assertEqual("shared.png", result["image_second_filename"])
        self.assertEqual(before_hash, hashlib.sha256(image.read_bytes()).hexdigest())
        self.assertEqual(2, len(self.voice._audio_history_entries()))

    def test_revoice_cancelled_before_backend_execution_creates_nothing(self) -> None:
        self._entry("original.wav")
        cancellation = threading.Event()
        cancellation.set()
        before = {path.name for path in Path(self.voice._nova_audio_output_dir()).iterdir()}
        with self.assertRaises(InterruptedError):
            self.voice._revoice_history_entry({
                "filename": "original.wav",
                "promptSource": "Spoken",
                "engine": "OmniLoko",
            }, cancellation)
        after = {path.name for path in Path(self.voice._nova_audio_output_dir()).iterdir()}
        self.assertEqual(before, after)

    def test_voice_frontend_uses_serializable_supported_hiding_and_refresh(self) -> None:
        source = (ROOT / "web/nova_voice_engine.js").read_text(encoding="utf-8")
        self.assertNotIn("item.hidden =", source)
        self.assertIn('item.type = visible ? item.__novaVoiceEngineOriginalType : "hidden"', source)
        self.assertIn("Refresh Voices", source)
        self.assertIn("/nova_voice/voices", source)
        self.assertIn("novaVoiceStalePreset", source)
        for name in ("omniloko_voice", "kokoro_voice", "prefix", "max_characters", "speed", "device", "normalize_loudness", "timeout_seconds"):
            with self.subTest(widget=name):
                self.assertIn(name, source)

    def test_compare_split_reaches_both_edges_in_both_orientations(self) -> None:
        source = (ROOT / "web/nova_image_compare.js").read_text(encoding="utf-8")
        self.assertNotIn("novaComparePosition ?? global.position / 100) * 100, 1, 99", source)
        self.assertIn("novaComparePosition ?? global.position / 100) * 100, 0, 100", source)
        for orientation in ("Vertical", "Horizontal"):
            with self.subTest(orientation=orientation):
                for position in (0, 50, 100):
                    clipped = max(0, min(100, position))
                    self.assertEqual(position, clipped)

    def test_compare_frontend_never_writes_node_theme_colours(self) -> None:
        source = (ROOT / "web/nova_image_compare.js").read_text(encoding="utf-8")
        for assignment in ("node.color =", "node.bgcolor =", "node.boxcolor ="):
            self.assertNotIn(assignment, source)


if __name__ == "__main__":
    unittest.main()
