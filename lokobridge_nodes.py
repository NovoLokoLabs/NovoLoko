"""Optional OmniLoko speech generation through the local LokoBridge v1 host."""

from __future__ import annotations

import importlib
import hashlib
import io
import os
import threading
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import urlsplit

from .nodes import NOVA_VERSION


PROFILE_VOICE = "Current OmniLoko Profile"
_BASE_PATH = "/lokobridge/v1/"
_REQUIRED_CAPABILITIES_REVISION = 1
_MAX_AUDIO_BYTES = 256 * 1024 * 1024
_POLL_SECONDS = 1.0
_PROBE_REQUEST_SECONDS = 0.35
_PROBE_TOTAL_SECONDS = 1.0
_SCHEMA_CACHE_SECONDS = 2.0
_SCHEMA_CACHE_LOCK = threading.Lock()
_SCHEMA_CACHE_EXPIRES_AT = 0.0
_SCHEMA_CACHE_OPTIONS: tuple[str, ...] = (PROFILE_VOICE,)
_SCHEMA_CACHE_PRESET_IDS: dict[str, str | None] = {PROFILE_VOICE: None}
_STALE_PRESET_MESSAGE = (
    "The selected OmniLoko preset is no longer available. Refresh the node after starting OmniLoko "
    "and select the voice again."
)

# Release packaging intentionally remains blocked until lokobridge-client has
# an official public wheel distribution route. NovoLoko public CI must not use
# private Git URLs, deploy keys, repository tokens, or committed wheel files.


@dataclass(frozen=True)
class _BridgeSession:
    api: Any
    discovery: Any
    client: Any
    capabilities: Any


def _load_client_api():
    try:
        return importlib.import_module("lokobridge_client")
    except ImportError as exc:
        raise RuntimeError(
            "OmniLoko support is not installed for NovoLoko. Install the official "
            "lokobridge-client package, restart ComfyUI, and try again."
        ) from exc


def _process_is_running(pid: int) -> bool:
    if pid < 1:
        return False
    if os.name == "nt":
        try:
            import ctypes

            process_query_limited_information = 0x1000
            still_active = 259
            handle = ctypes.windll.kernel32.OpenProcess(process_query_limited_information, False, int(pid))
            if not handle:
                return False
            try:
                exit_code = ctypes.c_ulong()
                return bool(ctypes.windll.kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code))) and exit_code.value == still_active
            finally:
                ctypes.windll.kernel32.CloseHandle(handle)
        except Exception:
            return False
    try:
        os.kill(int(pid), 0)
        return True
    except (OSError, ValueError):
        return False


def _validate_endpoint(base_url: str) -> None:
    parsed = urlsplit(str(base_url or ""))
    if (
        parsed.scheme != "http"
        or parsed.hostname != "127.0.0.1"
        or parsed.username is not None
        or parsed.password is not None
        or parsed.port is None
        or parsed.path != _BASE_PATH
        or parsed.query
        or parsed.fragment
    ):
        raise RuntimeError("OmniLoko LokoBridge endpoint is not a permitted literal IPv4 loopback address.")


def _deadline_transport(deadline: float | None = None, request_limit: float | None = None):
    def transport(
        method: str,
        url: str,
        headers: Mapping[str, str],
        body: bytes | None,
        timeout: float,
    ) -> tuple[int, Mapping[str, str], bytes]:
        effective = float(timeout)
        if request_limit is not None:
            effective = min(effective, request_limit)
        if deadline is not None:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("LokoBridge request deadline expired.")
            effective = min(effective, remaining)
        request = urllib.request.Request(url, data=body, headers=dict(headers), method=method)
        try:
            with urllib.request.urlopen(request, timeout=max(0.01, effective)) as response:
                return response.status, dict(response.headers.items()), response.read()
        except urllib.error.HTTPError as exc:
            return exc.code, dict(exc.headers.items()), exc.read()

    return transport


def _read_discovery(api: Any):
    try:
        path = Path(api.models.discovery_path())
    except AttributeError:
        models = importlib.import_module("lokobridge_client.models")
        path = Path(models.discovery_path())
    if not path.is_file():
        raise RuntimeError(
            "OmniLoko is unavailable. Start OmniLoko normally or with --bridge-only, then run this node again."
        )
    try:
        text = path.read_text(encoding="utf-8")
        discovery = api.parse_discovery(text)
    except Exception as exc:
        raise RuntimeError(
            "OmniLoko discovery information is invalid. Restart OmniLoko, then run this node again."
        ) from exc
    if not _process_is_running(discovery.pid):
        raise RuntimeError(
            "OmniLoko is unavailable. Start OmniLoko normally or with --bridge-only, then run this node again."
        )
    _validate_endpoint(discovery.base_url)
    return discovery


def _connect(deadline: float | None = None, request_limit: float | None = None) -> _BridgeSession:
    api = _load_client_api()
    discovery = _read_discovery(api)
    try:
        client = api.LokoBridgeClient(
            discovery,
            transport=_deadline_transport(deadline, request_limit),
            metadata_timeout=request_limit or 5.0,
        )
        health = client.health()
        if (
            health.get("status") != "ok"
            or health.get("protocolMajor") != 1
            or health.get("instanceId") != discovery.instance_id
        ):
            raise RuntimeError("health mismatch")
        capabilities = client.capabilities()
        if (
            capabilities.capabilities_revision < _REQUIRED_CAPABILITIES_REVISION
            or capabilities.capabilities_revision < discovery.capabilities_revision
            or not capabilities.supports("speech.generate@1")
            or not capabilities.supports("audio.wav@1")
        ):
            raise RuntimeError("required capability missing")
        return _BridgeSession(api, discovery, client, capabilities)
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(
            "OmniLoko is unavailable. Start OmniLoko normally or with --bridge-only, then run this node again."
        ) from exc


def _clean_display_name(value: Any) -> str:
    text = " ".join(str(value or "").split()).strip()
    if "/" in text or "\\" in text:
        return "Saved OmniLoko preset"
    return text[:160] or "Saved OmniLoko preset"


def _valid_preset_id(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    preset_id = value.strip()
    if (
        not preset_id
        or len(preset_id) > 512
        or "/" in preset_id
        or "\\" in preset_id
        or preset_id.casefold().endswith(".pt")
        or any(ord(character) < 32 for character in preset_id)
    ):
        return None
    return preset_id


def _preset_choices(
    presets: Any,
    forbidden_values: tuple[str, ...] = (),
) -> tuple[list[str], dict[str, str | None]]:
    options = [PROFILE_VOICE]
    mapping: dict[str, str | None] = {PROFILE_VOICE: None}
    if not isinstance(presets, list):
        raise ValueError("invalid preset list")

    by_id: dict[str, str] = {}
    for item in presets:
        if not isinstance(item, dict):
            continue
        preset_id = _valid_preset_id(item.get("id"))
        if preset_id is None:
            continue
        display_name = _clean_display_name(item.get("displayName"))
        if any(secret and (secret in preset_id or secret in display_name) for secret in forbidden_values):
            continue
        previous = by_id.get(preset_id)
        if previous is None or (display_name.casefold(), display_name) < (previous.casefold(), previous):
            by_id[preset_id] = display_name

    grouped: dict[str, list[str]] = {}
    for preset_id, display_name in by_id.items():
        grouped.setdefault(display_name, []).append(preset_id)

    for display_name in sorted(grouped, key=lambda value: (value.casefold(), value)):
        preset_ids = sorted(grouped[display_name])
        duplicate_name = len(preset_ids) > 1 or display_name == PROFILE_VOICE
        for preset_id in preset_ids:
            label = display_name
            if duplicate_name:
                digest = hashlib.sha256(preset_id.encode("utf-8")).hexdigest()
                suffix_length = 8
                label = f"{display_name} · {digest[:suffix_length]}"
                while label in mapping and suffix_length < len(digest):
                    suffix_length += 4
                    label = f"{display_name} · {digest[:suffix_length]}"
                duplicate_index = 2
                while label in mapping:
                    label = f"{display_name} · {digest} ({duplicate_index})"
                    duplicate_index += 1
            if label in mapping:
                continue
            mapping[label] = preset_id
            options.append(label)
    return options, mapping


def _voice_options() -> list[str]:
    global _SCHEMA_CACHE_EXPIRES_AT, _SCHEMA_CACHE_OPTIONS, _SCHEMA_CACHE_PRESET_IDS
    now = time.monotonic()
    with _SCHEMA_CACHE_LOCK:
        if now < _SCHEMA_CACHE_EXPIRES_AT:
            return list(_SCHEMA_CACHE_OPTIONS)

        options = [PROFILE_VOICE]
        mapping: dict[str, str | None] = {PROFILE_VOICE: None}
        try:
            deadline = time.monotonic() + _PROBE_TOTAL_SECONDS
            session = _connect(deadline=deadline, request_limit=_PROBE_REQUEST_SECONDS)
            if session.capabilities.supports("voice.preset.list@1"):
                response = session.client.presets()
                options, mapping = _preset_choices(
                    response.get("presets"),
                    (session.discovery.bearer_token, session.discovery.instance_id),
                )
        except Exception:
            pass

        _SCHEMA_CACHE_OPTIONS = tuple(options)
        _SCHEMA_CACHE_PRESET_IDS = dict(mapping)
        _SCHEMA_CACHE_EXPIRES_AT = time.monotonic() + _SCHEMA_CACHE_SECONDS
        return list(_SCHEMA_CACHE_OPTIONS)


def _resolve_voice(voice: str, session: _BridgeSession) -> tuple[dict[str, str], str]:
    selected = str(voice or PROFILE_VOICE)
    if selected == PROFILE_VOICE:
        return {"kind": "profile-current"}, PROFILE_VOICE
    if not session.capabilities.supports("voice.preset.list@1"):
        raise RuntimeError(_STALE_PRESET_MESSAGE)
    try:
        response = session.client.presets()
        _options, current_mapping = _preset_choices(
            response.get("presets"),
            (session.discovery.bearer_token, session.discovery.instance_id),
        )
    except Exception:
        raise RuntimeError(_STALE_PRESET_MESSAGE)
    preset_id = current_mapping.get(selected)
    if preset_id is None:
        raise RuntimeError(_STALE_PRESET_MESSAGE)
    return {"kind": "preset", "presetId": preset_id}, selected


def _silent_audio(seconds: float = 0.25):
    try:
        import torch
    except ImportError as exc:
        raise RuntimeError("NovoLoko OmniLoko TTS needs PyTorch from the ComfyUI environment.") from exc
    sample_rate = 24_000
    return {
        "waveform": torch.zeros((1, 1, max(1, int(sample_rate * seconds))), dtype=torch.float32),
        "sample_rate": sample_rate,
    }


def _decode_wav(payload: bytes):
    if not payload:
        raise RuntimeError("OmniLoko returned an empty WAV response.")
    if len(payload) > _MAX_AUDIO_BYTES:
        raise RuntimeError("OmniLoko returned an excessively large WAV response.")
    if len(payload) < 12 or payload[:4] != b"RIFF" or payload[8:12] != b"WAVE":
        raise RuntimeError("OmniLoko returned malformed WAV audio.")
    try:
        import numpy as np
        import soundfile as sf
        import torch
    except ImportError as exc:
        raise RuntimeError(
            "NovoLoko OmniLoko TTS needs SoundFile, NumPy and PyTorch from the optional voice stack."
        ) from exc
    try:
        with sf.SoundFile(io.BytesIO(payload)) as source:
            if source.format != "WAV" or source.samplerate <= 0 or source.frames <= 0 or source.channels <= 0:
                raise ValueError("invalid WAV metadata")
            sample_rate = int(source.samplerate)
            samples = source.read(dtype="float32", always_2d=True)
        if not samples.size or not np.isfinite(samples).all():
            raise ValueError("invalid WAV samples")
        waveform = torch.from_numpy(np.ascontiguousarray(samples.T, dtype=np.float32)).unsqueeze(0)
        return {"waveform": waveform, "sample_rate": sample_rate}
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError("OmniLoko returned malformed WAV audio.") from exc


def _raise_if_interrupted() -> None:
    try:
        model_management = importlib.import_module("comfy.model_management")
    except ImportError:
        return
    checker = getattr(model_management, "throw_exception_if_processing_interrupted", None)
    if callable(checker):
        checker()


def _is_interruption(exception: BaseException) -> bool:
    return isinstance(exception, (KeyboardInterrupt, InterruptedError)) or "interrupt" in type(exception).__name__.lower()


def _cancel_quietly(session: _BridgeSession, job_id: str) -> None:
    try:
        cancellation_client = session.api.LokoBridgeClient(
            session.discovery,
            transport=_deadline_transport(request_limit=2.0),
            metadata_timeout=2.0,
        )
        cancellation_client.cancel_job(job_id)
    except Exception:
        pass


def _redact(value: Any, token: str) -> str:
    text = " ".join(str(value or "").split()).strip()
    if token:
        text = text.replace(token, "[redacted]")
    return text[:500]


def _bridge_error(exception: BaseException, session: _BridgeSession | None, request_id: str) -> RuntimeError:
    token = session.discovery.bearer_token if session is not None else ""
    api_error = getattr(session.api, "BridgeApiError", ()) if session is not None else ()
    if api_error and isinstance(exception, api_error):
        error = exception.error
        code = _redact(getattr(error, "code", "bridge_error"), token) or "bridge_error"
        diagnostic_id = _redact(getattr(error, "diagnostic_id", "unavailable"), token) or "unavailable"
        safe_request_id = _redact(getattr(error, "request_id", request_id), token) or request_id
        message = _redact(getattr(error, "message", "OmniLoko could not generate speech."), token)
        return RuntimeError(
            f"OmniLoko speech failed: {message} "
            f"(code: {code}; diagnostic: {diagnostic_id}; request: {safe_request_id})"
        )
    if isinstance(exception, TimeoutError):
        return RuntimeError(
            f"OmniLoko speech timed out (code: bridge_timeout; diagnostic: unavailable; request: {request_id})."
        )
    if isinstance(exception, RuntimeError) and str(exception).startswith(("OmniLoko", "The selected OmniLoko")):
        return exception
    return RuntimeError(
        f"OmniLoko returned an invalid LokoBridge response "
        f"(code: invalid_bridge_response; diagnostic: unavailable; request: {request_id})."
    )


def _job_failure(job: Any, token: str, request_id: str) -> RuntimeError:
    error = getattr(job, "error", None)
    if error is None:
        return RuntimeError(
            f"OmniLoko speech failed (code: bridge_job_failed; diagnostic: unavailable; request: {request_id})."
        )
    code = _redact(getattr(error, "code", "bridge_job_failed"), token) or "bridge_job_failed"
    diagnostic_id = _redact(getattr(error, "diagnostic_id", "unavailable"), token) or "unavailable"
    safe_request_id = _redact(getattr(error, "request_id", request_id), token) or request_id
    message = _redact(getattr(error, "message", "OmniLoko could not generate speech."), token)
    return RuntimeError(
        f"OmniLoko speech failed: {message} "
        f"(code: {code}; diagnostic: {diagnostic_id}; request: {safe_request_id})"
    )


class NovaOmniLokoTTS:
    """Generate ComfyUI AUDIO through the canonical local OmniLoko voice runtime."""

    @classmethod
    def INPUT_TYPES(cls):
        voices = _voice_options()
        return {
            "required": {
                "text": ("STRING", {"default": "NovoLoko OmniLoko voice is ready.", "multiline": True}),
                "voice": (voices, {"default": PROFILE_VOICE}),
                "normalize_loudness": ("BOOLEAN", {"default": True}),
                "enabled": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "prefix": ("STRING", {"default": "", "multiline": False}),
                "max_characters": ("INT", {"default": 2000, "min": 1, "max": 20000}),
                "timeout_seconds": ("INT", {"default": 300, "min": 1, "max": 3600}),
            },
        }

    RETURN_TYPES = ("AUDIO", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("audio", "spoken_text", "status", "voice_used")
    FUNCTION = "speak"
    CATEGORY = "NovoLoko/Voice"
    OUTPUT_NODE = True

    def speak(
        self,
        text="",
        voice=PROFILE_VOICE,
        normalize_loudness=True,
        enabled=True,
        prefix="",
        max_characters=2000,
        timeout_seconds=300,
    ):
        selected_voice = str(voice or PROFILE_VOICE)
        if not enabled:
            return (_silent_audio(), "", "NovoLoko OmniLoko TTS disabled", selected_voice)

        spoken = " ".join(str(text or "").split()).strip()
        pre = " ".join(str(prefix or "").split()).strip()
        if pre:
            spoken = f"{pre} {spoken}".strip()
        limit = max(1, min(20_000, int(max_characters or 2000)))
        spoken = spoken[:limit].strip()
        if not spoken:
            return (_silent_audio(), "", "No text supplied to NovoLoko OmniLoko TTS", selected_voice)

        timeout = max(1, min(3600, int(timeout_seconds or 300)))
        deadline = time.monotonic() + timeout
        request_id = uuid.uuid4().hex
        session: _BridgeSession | None = None
        accepted_job_id: str | None = None
        try:
            _raise_if_interrupted()
            try:
                session = _connect(deadline=deadline)
            except Exception as exc:
                if selected_voice != PROFILE_VOICE:
                    raise RuntimeError(_STALE_PRESET_MESSAGE) from exc
                raise
            voice_request, voice_used = _resolve_voice(selected_voice, session)
            request = {
                "clientName": "NovoLoko",
                "clientVersion": NOVA_VERSION,
                "requestId": request_id,
                "text": spoken,
                "normalizeLoudness": bool(normalize_loudness),
                "voice": voice_request,
            }
            job = session.client.create_speech_job(request)
            accepted_job_id = job.id
            if job.request_id != request_id:
                raise RuntimeError("OmniLoko returned an invalid LokoBridge response.")

            while True:
                _raise_if_interrupted()
                if time.monotonic() >= deadline:
                    raise TimeoutError("LokoBridge speech deadline expired.")
                if job.state == "completed":
                    if not job.audio_available:
                        raise RuntimeError("OmniLoko completed speech without downloadable WAV audio.")
                    remaining = max(0.01, deadline - time.monotonic())
                    payload = session.client.get_job_audio(job.id, timeout=min(60.0, remaining))
                    audio = _decode_wav(payload)
                    samples = int(audio["waveform"].shape[-1])
                    duration = samples / int(audio["sample_rate"])
                    return (
                        audio,
                        spoken,
                        f"Generated {duration:.2f}s with OmniLoko through LokoBridge v1",
                        voice_used,
                    )
                if job.state == "failed":
                    raise _job_failure(job, session.discovery.bearer_token, request_id)
                if job.state == "cancelled":
                    raise InterruptedError("OmniLoko cancelled the speech job.")
                if job.state == "expired":
                    raise RuntimeError(
                        f"OmniLoko speech expired (code: job_expired; diagnostic: unavailable; request: {request_id})."
                    )
                if job.state not in {"queued", "loading", "running"}:
                    raise RuntimeError("OmniLoko returned an invalid LokoBridge response.")
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError("LokoBridge speech deadline expired.")
                time.sleep(min(_POLL_SECONDS, remaining))
                job = session.client.get_job(job.id)
        except BaseException as exc:
            if session is not None and accepted_job_id and (isinstance(exc, TimeoutError) or _is_interruption(exc)):
                _cancel_quietly(session, accepted_job_id)
            if isinstance(exc, (KeyboardInterrupt, InterruptedError)) or _is_interruption(exc):
                raise
            raise _bridge_error(exc, session, request_id) from exc


NODE_CLASS_MAPPINGS = {
    "NovaOmniLokoTTS": NovaOmniLokoTTS,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NovaOmniLokoTTS": "NovoLoko OmniLoko TTS",
}
