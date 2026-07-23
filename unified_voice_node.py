"""Compact selector for the existing NovoLoko Kokoro and OmniLoko TTS backends."""

from __future__ import annotations

from .lokobridge_nodes import PROFILE_VOICE, NovaOmniLokoTTS
from .voice_nodes import KOKORO_VOICES, NovaKokoroTTS, _silent_audio


KOKORO_DEFAULT_VOICE = "af_nova | NovoLoko (US Female)"
ENGINE_OPTIONS = ["OmniLoko", "Kokoro", "Off"]


def _normalise_engine(value: str) -> str:
    clean = str(value or "Off").strip().lower()
    if clean == "omniloko":
        return "OmniLoko"
    if clean == "kokoro":
        return "Kokoro"
    return "Off"


class NovaVoiceEngineTTS:
    """Dispatch to exactly one existing TTS backend without cross-backend fallback."""

    @classmethod
    def INPUT_TYPES(cls):
        omni_voices = NovaOmniLokoTTS.INPUT_TYPES()["required"]["voice"]
        return {
            "required": {
                "text": (
                    "STRING",
                    {"default": "NovoLoko Voice TTS is ready.", "multiline": True},
                ),
                "engine": (ENGINE_OPTIONS, {"default": "OmniLoko"}),
                "enabled": ("BOOLEAN", {"default": True}),
                "omniloko_voice": omni_voices,
                "kokoro_voice": (
                    KOKORO_VOICES,
                    {"default": KOKORO_DEFAULT_VOICE},
                ),
                "advanced": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                "prefix": ("STRING", {"default": "", "multiline": False}),
                "max_characters": (
                    "INT",
                    {"default": 2000, "min": 1, "max": 20000},
                ),
                "speed": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.5, "max": 2.0, "step": 0.05},
                ),
                "device": (["Auto", "CUDA", "CPU"], {"default": "Auto"}),
                "normalize_loudness": ("BOOLEAN", {"default": True}),
                "timeout_seconds": (
                    "INT",
                    {"default": 300, "min": 1, "max": 3600},
                ),
            },
        }

    RETURN_TYPES = ("AUDIO", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("audio", "spoken_text", "status", "voice_used", "engine_used")
    FUNCTION = "speak"
    CATEGORY = "NovoLoko/Voice"
    OUTPUT_NODE = True

    def speak(
        self,
        text="",
        engine="OmniLoko",
        enabled=True,
        omniloko_voice=PROFILE_VOICE,
        kokoro_voice=KOKORO_DEFAULT_VOICE,
        advanced=False,
        prefix="",
        max_characters=2000,
        speed=1.0,
        device="Auto",
        normalize_loudness=True,
        timeout_seconds=300,
    ):
        del advanced  # Presentation-only saved value; backend behavior is explicit.
        selected_engine = _normalise_engine(engine)
        selected_voice = (
            str(omniloko_voice or PROFILE_VOICE)
            if selected_engine == "OmniLoko"
            else str(kokoro_voice or KOKORO_DEFAULT_VOICE)
            if selected_engine == "Kokoro"
            else ""
        )

        if not enabled:
            return (
                _silent_audio(0.05),
                "",
                f"NovoLoko Voice TTS disabled; selected engine: {selected_engine}",
                selected_voice,
                selected_engine,
            )
        if selected_engine == "Off":
            return (
                _silent_audio(0.05),
                "",
                "NovoLoko Voice TTS is Off; choose OmniLoko or Kokoro to generate speech",
                "",
                "Off",
            )

        if selected_engine == "OmniLoko":
            audio, spoken, status, voice_used = NovaOmniLokoTTS().speak(
                text=text,
                voice=selected_voice,
                normalize_loudness=normalize_loudness,
                enabled=True,
                prefix=prefix,
                max_characters=max_characters,
                timeout_seconds=timeout_seconds,
            )
            return (audio, spoken, status, voice_used, "OmniLoko")

        audio, spoken, status, voice_used = NovaKokoroTTS().speak(
            text=text,
            voice=selected_voice,
            speed=speed,
            device=device,
            enabled=True,
            prefix=prefix,
            max_characters=max_characters,
        )
        return (audio, spoken, status, voice_used, "Kokoro")


NODE_CLASS_MAPPINGS = {
    "NovaVoiceEngineTTS": NovaVoiceEngineTTS,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NovaVoiceEngineTTS": "NovoLoko Voice TTS",
}
