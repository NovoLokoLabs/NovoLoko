from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
from typing import Any, Dict, Optional, Tuple

from .nova_metadata import build_metadata_fields, build_pnginfo

NOVA_VOICE_VERSION = "3.5.0"

_MODEL_CACHE: Dict[Tuple[str, str, str], Any] = {}
_MODEL_LOCK = threading.Lock()
_REVOICE_JOBS: Dict[str, threading.Event] = {}
_REVOICE_JOBS_LOCK = threading.Lock()


def _bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _clean_model_name(model_name: str, local_model_path: str = "") -> str:
    local_path = str(local_model_path or "").strip().strip('"')
    if local_path:
        return os.path.abspath(os.path.expanduser(local_path))
    return str(model_name or "small.en").strip() or "small.en"


def _resolve_device(requested: str) -> str:
    value = str(requested or "Auto").strip().lower()
    if value in {"cuda", "cpu"}:
        return value
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"


def _resolve_compute_type(device: str, requested: str) -> str:
    value = str(requested or "Auto").strip().lower()
    if value != "auto":
        return value
    return "float16" if device == "cuda" else "int8"


def _import_whisper_model():
    try:
        from faster_whisper import WhisperModel

        return WhisperModel
    except Exception as exc:
        raise RuntimeError(
            "faster-whisper is not installed in ComfyUI\'s Python. Run INSTALL_NOVA_VOICE_AND_KOKORO.bat, "
            "then restart ComfyUI."
        ) from exc


def _load_model(
    model_name: str,
    requested_device: str,
    requested_compute_type: str,
    local_model_path: str = "",
):
    WhisperModel = _import_whisper_model()
    model_source = _clean_model_name(model_name, local_model_path)
    first_device = _resolve_device(requested_device)
    first_compute = _resolve_compute_type(first_device, requested_compute_type)

    candidates = [(first_device, first_compute)]
    if str(requested_device or "Auto").strip().lower() == "auto" and first_device == "cuda":
        # A missing CUDA/cuDNN DLL should not make voice input unusable. Auto mode safely falls back to CPU.
        candidates.append(("cpu", "int8"))

    last_error: Optional[Exception] = None
    for device, compute_type in candidates:
        key = (model_source, device, compute_type)
        with _MODEL_LOCK:
            cached = _MODEL_CACHE.get(key)
            if cached is not None:
                return cached, device, compute_type
            try:
                model = WhisperModel(model_source, device=device, compute_type=compute_type)
                _MODEL_CACHE[key] = model
                return model, device, compute_type
            except Exception as exc:
                last_error = exc

    raise RuntimeError(
        f"Unable to load Whisper model '{model_source}'. Last error: {last_error}"
    ) from last_error


def _postprocess_text(text: str, trim_fillers: bool, punctuation_mode: str) -> str:
    value = re.sub(r"\s+", " ", str(text or "")).strip()
    if trim_fillers:
        value = re.sub(r"(?i)(?<![\w-])(?:um+|uh+|erm+|hmm+)(?![\w-])[,\s]*", "", value)
        value = re.sub(r"\s+", " ", value).strip(" ,")

    if punctuation_mode == "Comma Prompt":
        value = re.sub(r"[.!?;:]+\s*", ", ", value)
        value = re.sub(r"\s*,\s*", ", ", value)
        value = re.sub(r"(?:,\s*){2,}", ", ", value).strip(" ,")
    return value


def _transcribe_file(
    audio_path: str,
    model_name: str,
    local_model_path: str,
    language: str,
    translate_to_english: bool,
    requested_device: str,
    requested_compute_type: str,
    vad_filter: bool,
    trim_fillers: bool,
    punctuation_mode: str,
    prompt_hint: str,
) -> Dict[str, Any]:
    language_value = str(language or "Auto").strip()
    effective_model_name = str(model_name or "small.en").strip() or "small.en"
    use_multilingual = translate_to_english or language_value.lower() not in {"", "auto", "automatic", "english", "en"}
    if not str(local_model_path or "").strip() and use_multilingual and effective_model_name.endswith(".en"):
        effective_model_name = effective_model_name[:-3]

    model, actual_device, actual_compute = _load_model(
        model_name=effective_model_name,
        requested_device=requested_device,
        requested_compute_type=requested_compute_type,
        local_model_path=local_model_path,
    )

    language_code = None if language_value.lower() in {"", "auto", "automatic"} else language_value
    if language_code and len(language_code) > 3:
        language_aliases = {
            "english": "en",
            "japanese": "ja",
            "korean": "ko",
            "chinese": "zh",
            "german": "de",
            "french": "fr",
            "spanish": "es",
            "italian": "it",
            "portuguese": "pt",
        }
        language_code = language_aliases.get(language_code.lower(), language_code)

    kwargs: Dict[str, Any] = {
        "beam_size": 5,
        "vad_filter": bool(vad_filter),
        "condition_on_previous_text": False,
        "task": "translate" if translate_to_english else "transcribe",
    }
    if language_code:
        kwargs["language"] = language_code
    if str(prompt_hint or "").strip():
        kwargs["initial_prompt"] = str(prompt_hint).strip()
    if vad_filter:
        kwargs["vad_parameters"] = {"min_silence_duration_ms": 500}

    segments, info = model.transcribe(audio_path, **kwargs)
    raw_text = " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()
    text = _postprocess_text(raw_text, trim_fillers, punctuation_mode)

    return {
        "text": text,
        "raw_text": raw_text,
        "language": getattr(info, "language", language_code or "unknown"),
        "language_probability": float(getattr(info, "language_probability", 0.0) or 0.0),
        "duration": float(getattr(info, "duration", 0.0) or 0.0),
        "model": _clean_model_name(effective_model_name, local_model_path),
        "device": actual_device,
        "compute_type": actual_compute,
    }


_KOKORO_PIPELINES: Dict[Tuple[str, str], Any] = {}
_KOKORO_LOCK = threading.Lock()

KOKORO_VOICES = [
    "af_heart | Heart (US Female)",
    "af_bella | Bella (US Female)",
    "af_nicole | Nicole (US Female)",
    "af_aoede | Aoede (US Female)",
    "af_kore | Kore (US Female)",
    "af_sarah | Sarah (US Female)",
    "af_nova | NovoLoko (US Female)",
    "af_sky | Sky (US Female)",
    "af_alloy | Alloy (US Female)",
    "af_jessica | Jessica (US Female)",
    "af_river | River (US Female)",
    "am_michael | Michael (US Male)",
    "am_fenrir | Fenrir (US Male)",
    "am_puck | Puck (US Male)",
    "am_echo | Echo (US Male)",
    "am_eric | Eric (US Male)",
    "am_liam | Liam (US Male)",
    "am_onyx | Onyx (US Male)",
    "am_adam | Adam (US Male)",
    "am_santa | Santa (US Male)",
    "bf_emma | Emma (UK Female)",
    "bf_isabella | Isabella (UK Female)",
    "bf_alice | Alice (UK Female)",
    "bf_lily | Lily (UK Female)",
    "bm_george | George (UK Male)",
    "bm_fable | Fable (UK Male)",
    "bm_lewis | Lewis (UK Male)",
    "bm_daniel | Daniel (UK Male)",
]


def _import_kokoro_pipeline():
    try:
        from kokoro import KPipeline
        return KPipeline
    except Exception as exc:
        raise RuntimeError(
            "Kokoro is not installed in ComfyUI's Python. "
            "Run INSTALL_NOVA_VOICE_AND_KOKORO.bat, restart ComfyUI, and try again."
        ) from exc


def _kokoro_device(requested: str) -> str:
    value = str(requested or "Auto").strip().lower()
    if value == "cpu":
        return "cpu"
    if value == "cuda":
        try:
            import torch
            if not torch.cuda.is_available():
                raise RuntimeError("CUDA was selected for Kokoro, but CUDA is not available.")
        except ImportError as exc:
            raise RuntimeError("PyTorch is unavailable in this ComfyUI environment.") from exc
        return "cuda"
    try:
        import torch
        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def _kokoro_pipeline(lang_code: str, requested_device: str):
    device = _kokoro_device(requested_device)
    key = (lang_code, device)
    with _KOKORO_LOCK:
        cached = _KOKORO_PIPELINES.get(key)
        if cached is not None:
            return cached, device
        KPipeline = _import_kokoro_pipeline()
        try:
            pipeline = KPipeline(
                lang_code=lang_code,
                repo_id="hexgrad/Kokoro-82M",
                device=device,
            )
        except Exception as exc:
            if str(requested_device or "Auto").strip().lower() == "auto" and device == "cuda":
                device = "cpu"
                key = (lang_code, device)
                cached = _KOKORO_PIPELINES.get(key)
                if cached is not None:
                    return cached, device
                pipeline = KPipeline(
                    lang_code=lang_code,
                    repo_id="hexgrad/Kokoro-82M",
                    device=device,
                )
            else:
                raise RuntimeError(f"Unable to initialize Kokoro on {device}: {exc}") from exc
        _KOKORO_PIPELINES[key] = pipeline
        return pipeline, device


def _silent_audio(seconds: float = 0.25):
    import torch
    sample_rate = 24000
    samples = max(1, int(sample_rate * float(seconds)))
    return {"waveform": torch.zeros((1, 1, samples), dtype=torch.float32), "sample_rate": sample_rate}



def _nova_audio_output_dir() -> str:
    try:
        import folder_paths

        output_root = folder_paths.get_output_directory()
    except Exception:
        output_root = os.path.abspath(os.path.join(os.getcwd(), "output"))
    path = os.path.join(output_root, "NovoLokoVoice", "Audio")
    os.makedirs(path, exist_ok=True)
    return path


def _safe_audio_prefix(value: str) -> str:
    clean = os.path.basename(str(value or "NovoLokoVoiceKokoro").strip())
    clean = re.sub(r"[^A-Za-z0-9._-]+", "_", clean).strip("._-")
    return clean or "NovoLokoVoiceKokoro"


def _audio_metadata_path(audio_path: str) -> str:
    return os.path.splitext(audio_path)[0] + ".json"


def _nova_audio_image_dir() -> str:
    path = os.path.join(_nova_audio_output_dir(), "Images")
    os.makedirs(path, exist_ok=True)
    return path



_MISSING_LAZY = object()


def _nova_autoplay_temp_dir() -> str:
    try:
        import folder_paths
        root = folder_paths.get_temp_directory()
    except Exception:
        root = tempfile.gettempdir()
    path = os.path.join(root, "NovoLokoVoice", "Autoplay")
    os.makedirs(path, exist_ok=True)
    return path


def _save_autoplay_audio(audio: Any) -> tuple[str, float]:
    if not audio or "waveform" not in audio or "sample_rate" not in audio:
        raise ValueError("NovoLoko Autoplay Trigger received no valid AUDIO input.")
    try:
        import numpy as np
        import soundfile as sf
        import torch
    except Exception as exc:
        raise RuntimeError("NovoLoko Autoplay Trigger needs soundfile, NumPy and PyTorch.") from exc

    waveform = audio["waveform"]
    sample_rate = int(audio["sample_rate"])
    if isinstance(waveform, torch.Tensor):
        data = waveform.detach().to("cpu", dtype=torch.float32).numpy()
    else:
        data = np.asarray(waveform, dtype=np.float32)
    if data.ndim == 3:
        data = data[0]
    if data.ndim == 2:
        data = data.T
    elif data.ndim != 1:
        data = data.reshape(-1)

    directory = _nova_autoplay_temp_dir()
    filename = f"nova_autoplay_{time.time_ns()}.wav"
    full_path = os.path.join(directory, filename)
    sf.write(full_path, data, sample_rate, subtype="PCM_16")
    duration = float((data.shape[0] if getattr(data, "ndim", 1) else 0) / sample_rate) if sample_rate > 0 else 0.0

    try:
        files = sorted(
            (os.path.join(directory, name) for name in os.listdir(directory) if name.lower().endswith(".wav")),
            key=os.path.getmtime,
            reverse=True,
        )
        for old in files[40:]:
            try:
                os.remove(old)
            except OSError:
                pass
    except OSError:
        pass
    return filename, duration


def _open_known_folder(kind: str, filename: str = "", reveal: bool = False) -> str:
    key = str(kind or "audio").strip().lower()
    directory = _nova_audio_image_dir() if key in {"image", "images"} else _nova_audio_output_dir()
    directory = os.path.realpath(directory)
    selected = ""
    if filename:
        candidate = os.path.realpath(os.path.join(directory, os.path.basename(str(filename))))
        if os.path.dirname(candidate) == directory and os.path.exists(candidate):
            selected = candidate

    if os.name == "nt":
        if reveal and selected:
            subprocess.Popen(["explorer.exe", f"/select,{selected}"], close_fds=True)
        else:
            os.startfile(directory)  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        if reveal and selected:
            subprocess.Popen(["open", "-R", selected], close_fds=True)
        else:
            subprocess.Popen(["open", directory], close_fds=True)
    else:
        subprocess.Popen(["xdg-open", directory], close_fds=True)
    return selected or directory


def _voice_code(value: str) -> str:
    return str(value or "").split("|", 1)[0].strip()


def _save_history_image(image: Any, stem: str, max_size: int = 0, metadata_fields: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Save one ComfyUI IMAGE without silently resizing it.

    The returned audit records both the incoming tensor size and the PNG size
    read back from disk. A non-zero max_size is the only allowed resize path.
    """
    empty = {
        "filename": "", "source_width": 0, "source_height": 0,
        "saved_width": 0, "saved_height": 0, "capped": False,
    }
    if image is None:
        return empty
    try:
        import numpy as np
        from PIL import Image
        try:
            import torch
        except Exception:
            torch = None

        value = image
        if torch is not None and isinstance(value, torch.Tensor):
            value = value.detach().to("cpu", dtype=torch.float32).numpy()
        else:
            value = np.asarray(value)
        if value.ndim == 4:
            value = value[0]
        if value.ndim != 3 or value.shape[-1] not in (1, 3, 4):
            return empty

        source_height, source_width = int(value.shape[0]), int(value.shape[1])
        value = np.nan_to_num(value, nan=0.0, posinf=1.0, neginf=0.0)
        if value.dtype != np.uint8:
            value = np.clip(value, 0.0, 1.0)
            value = (value * 255.0 + 0.5).astype(np.uint8)
        if value.shape[-1] == 1:
            value = value[:, :, 0]

        pil = Image.fromarray(value)
        capped = False
        if max_size > 0 and max(pil.size) > max_size:
            scale = float(max_size) / float(max(pil.size))
            pil = pil.resize(
                (max(1, round(pil.width * scale)), max(1, round(pil.height * scale))),
                Image.Resampling.LANCZOS,
            )
            capped = True

        filename = f"{stem}.png"
        full = os.path.join(_nova_audio_image_dir(), filename)
        # Avoid PIL optimise rewriting surprises; compression changes bytes only.
        pil.save(full, format="PNG", pnginfo=build_pnginfo(metadata_fields), compress_level=2)
        with Image.open(full) as verify:
            saved_width, saved_height = verify.size
        return {
            "filename": filename,
            "source_width": source_width, "source_height": source_height,
            "saved_width": int(saved_width), "saved_height": int(saved_height),
            "capped": bool(capped),
        }
    except Exception:
        return empty


def _audio_history_entries(limit: int = 1000) -> list[Dict[str, Any]]:
    directory = _nova_audio_output_dir()
    max_items = max(1, min(int(limit or 1000), 5000))
    files = []
    try:
        for name in os.listdir(directory):
            if not name.lower().endswith((".wav", ".flac", ".mp3", ".ogg", ".opus")):
                continue
            full = os.path.join(directory, name)
            if not os.path.isfile(full):
                continue
            try:
                stat = os.stat(full)
            except OSError:
                continue
            files.append((stat.st_mtime, name, full, stat.st_size))
    except OSError:
        return []

    files.sort(key=lambda item: item[0], reverse=True)
    entries = []
    for modified, name, full, size in files[:max_items]:
        metadata: Dict[str, Any] = {}
        try:
            with open(_audio_metadata_path(full), "r", encoding="utf-8") as handle:
                loaded = json.load(handle)
                if isinstance(loaded, dict):
                    metadata = loaded
        except Exception:
            metadata = {}
        label = str(metadata.get("label") or "").strip()
        manual_prompt = str(metadata.get("manual_prompt") or "").strip()
        enhanced_prompt = str(metadata.get("enhanced_prompt") or "").strip()
        negative_prompt = str(metadata.get("negative_prompt") or "").strip()
        prompt_source = str(metadata.get("prompt_source") or "").strip()
        prompt_stack_summary = str(metadata.get("prompt_stack_summary") or "").strip()
        voice = str(metadata.get("voice") or "")
        def valid_history_image(value: Any) -> str:
            filename = os.path.basename(str(value or ""))
            if not filename:
                return ""
            image_path = os.path.join(_nova_audio_image_dir(), filename)
            return filename if os.path.isfile(image_path) else ""

        image_filename = valid_history_image(metadata.get("image_filename"))
        image_first_filename = valid_history_image(metadata.get("image_first_filename"))
        image_second_filename = valid_history_image(metadata.get("image_second_filename"))
        # Older entries only had image_filename. Treat that as first-pass compatible.
        if not image_first_filename and image_filename:
            image_first_filename = image_filename
        if not image_filename:
            image_filename = image_second_filename or image_first_filename
        entries.append({
            "filename": name,
            "label": label,
            "voice": voice,
            "voice_code": str(metadata.get("voice_code") or _voice_code(voice)),
            "engine": str(metadata.get("engine") or ""),
            "revoice_prompt_source": str(metadata.get("revoice_prompt_source") or ""),
            "manual_prompt": manual_prompt,
            "enhanced_prompt": enhanced_prompt,
            "negative_prompt": negative_prompt,
            "prompt_source": prompt_source,
            "prompt_stack_summary": prompt_stack_summary,
            "image_filename": image_filename,
            "image_first_filename": image_first_filename,
            "image_second_filename": image_second_filename,
            "preview_image": str(metadata.get("preview_image") or ""),
            "history_image_resolution": str(metadata.get("history_image_resolution") or ""),
            "image_first_source_width": int(metadata.get("image_first_source_width") or 0),
            "image_first_source_height": int(metadata.get("image_first_source_height") or 0),
            "image_first_width": int(metadata.get("image_first_width") or 0),
            "image_first_height": int(metadata.get("image_first_height") or 0),
            "image_first_capped": bool(metadata.get("image_first_capped")),
            "image_second_source_width": int(metadata.get("image_second_source_width") or 0),
            "image_second_source_height": int(metadata.get("image_second_source_height") or 0),
            "image_second_width": int(metadata.get("image_second_width") or 0),
            "image_second_height": int(metadata.get("image_second_height") or 0),
            "image_second_capped": bool(metadata.get("image_second_capped")),
            "created": float(modified),
            "size": int(size),
            "duration": float(metadata.get("duration") or 0.0),
            "has_audio": bool(metadata.get("has_audio", True)),
            "media_only": bool(metadata.get("media_only", False)),
        })
    return entries


def _managed_history_path(directory: str, filename: Any, extensions: tuple[str, ...]) -> str:
    root = os.path.realpath(directory)
    raw = str(filename or "").strip()
    if (
        not raw
        or raw != os.path.basename(raw)
        or raw in {".", ".."}
        or not raw.lower().endswith(extensions)
    ):
        raise ValueError("Invalid managed history filename.")
    candidate = os.path.realpath(os.path.join(root, raw))
    if os.path.dirname(candidate) != root or os.path.commonpath([root, candidate]) != root:
        raise ValueError("History paths must stay inside NovoLoko managed storage.")
    if os.path.lexists(candidate) and os.path.islink(candidate):
        raise ValueError("Linked history files cannot be modified.")
    return candidate


def _history_metadata(filename: Any) -> tuple[str, str, Dict[str, Any]]:
    audio_path = _managed_history_path(
        _nova_audio_output_dir(),
        filename,
        (".wav", ".flac", ".mp3", ".ogg", ".opus"),
    )
    metadata_path = _managed_history_path(
        _nova_audio_output_dir(),
        os.path.splitext(os.path.basename(audio_path))[0] + ".json",
        (".json",),
    )
    try:
        with open(metadata_path, "r", encoding="utf-8") as handle:
            metadata = json.load(handle)
    except FileNotFoundError as exc:
        raise FileNotFoundError("The Media Studio metadata entry was not found.") from exc
    if not isinstance(metadata, dict):
        raise ValueError("The Media Studio metadata entry is invalid.")
    return audio_path, metadata_path, metadata


def _metadata_image_names(metadata: Dict[str, Any]) -> set[str]:
    names: set[str] = set()
    for key in ("image_filename", "image_first_filename", "image_second_filename"):
        raw = str(metadata.get(key) or "").strip()
        if raw and raw == os.path.basename(raw) and raw.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            names.add(raw)
    return names


def _other_history_image_references(excluded_metadata_path: str) -> set[str]:
    directory = os.path.realpath(_nova_audio_output_dir())
    referenced: set[str] = set()
    for name in os.listdir(directory):
        if not name.lower().endswith(".json"):
            continue
        path = os.path.realpath(os.path.join(directory, name))
        if path == excluded_metadata_path or os.path.dirname(path) != directory or os.path.islink(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as handle:
                metadata = json.load(handle)
            if isinstance(metadata, dict):
                referenced.update(_metadata_image_names(metadata))
        except Exception:
            continue
    return referenced


def _delete_history_entry(filename: Any) -> Dict[str, Any]:
    audio_path, metadata_path, metadata = _history_metadata(filename)
    image_directory = _nova_audio_image_dir()
    shared_images = _other_history_image_references(metadata_path)
    image_paths = []
    for image_name in sorted(_metadata_image_names(metadata) - shared_images):
        image_paths.append(
            _managed_history_path(
                image_directory,
                image_name,
                (".png", ".jpg", ".jpeg", ".webp"),
            )
        )

    removed = []
    for path in (audio_path, metadata_path, *image_paths):
        if os.path.isfile(path):
            os.remove(path)
            removed.append(os.path.basename(path))
    return {
        "removed": removed,
        "preservedSharedImages": sorted(_metadata_image_names(metadata) & shared_images),
        "items": _audio_history_entries(),
    }


def _write_history_audio(audio: Any, path: str) -> float:
    try:
        import numpy as np
        import soundfile as sf
        import torch
    except Exception as exc:
        raise RuntimeError(
            "Audio saving needs soundfile, NumPy and PyTorch. Run INSTALL_NOVA_VOICE_AND_KOKORO.bat."
        ) from exc
    if not isinstance(audio, dict) or "waveform" not in audio or "sample_rate" not in audio:
        raise ValueError("The selected voice backend returned no usable audio.")
    waveform = audio["waveform"]
    sample_rate = int(audio["sample_rate"])
    if isinstance(waveform, torch.Tensor):
        data = waveform.detach().to("cpu", dtype=torch.float32).numpy()
    else:
        data = np.asarray(waveform, dtype=np.float32)
    if data.ndim == 3:
        data = data[0]
    if data.ndim == 2:
        data = data.T
    elif data.ndim != 1:
        data = data.reshape(-1)
    if sample_rate <= 0 or not data.size or not np.isfinite(data).all():
        raise ValueError("The selected voice backend returned invalid audio.")
    sf.write(path, data, sample_rate, subtype="PCM_16")
    return float(data.shape[0] / sample_rate)


def _revoice_history_entry(data: Dict[str, Any], cancellation_event=None) -> Dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("Invalid revoice request.")
    _audio_path, _metadata_path, original = _history_metadata(data.get("filename"))
    prompt_mode = str(data.get("promptSource") or "Spoken").strip().title()
    prompt_keys = {"Spoken": "label", "Manual": "manual_prompt", "Enhanced": "enhanced_prompt"}
    if prompt_mode not in prompt_keys:
        raise ValueError("Prompt source must be Spoken, Manual or Enhanced.")
    text = str(original.get(prompt_keys[prompt_mode]) or "").strip()
    if not text:
        raise ValueError(f"No {prompt_mode.lower()} prompt is stored for this entry.")
    engine = str(data.get("engine") or "").strip()
    if engine not in {"OmniLoko", "Kokoro"}:
        raise ValueError("Revoice engine must be OmniLoko or Kokoro.")
    if cancellation_event is not None and cancellation_event.is_set():
        raise InterruptedError("Revoice cancelled.")

    from .unified_voice_node import (
        KOKORO_DEFAULT_VOICE,
        NovaVoiceEngineTTS,
    )
    from .lokobridge_nodes import PROFILE_VOICE, _external_cancellation

    voice = str(data.get("voice") or (PROFILE_VOICE if engine == "OmniLoko" else KOKORO_DEFAULT_VOICE))
    arguments = {
        "text": text,
        "engine": engine,
        "enabled": True,
        "omniloko_voice": voice if engine == "OmniLoko" else PROFILE_VOICE,
        "kokoro_voice": voice if engine == "Kokoro" else KOKORO_DEFAULT_VOICE,
        "advanced": bool(data.get("advanced")),
        "prefix": str(data.get("prefix") or ""),
        "max_characters": max(1, min(20000, int(data.get("maxCharacters") or 2000))),
        "speed": max(0.5, min(2.0, float(data.get("speed") or 1.0))),
        "device": str(data.get("device") or "Auto"),
        "normalize_loudness": _bool(data.get("normalizeLoudness"), True),
        "timeout_seconds": max(1, min(3600, int(data.get("timeoutSeconds") or 300))),
    }
    with _external_cancellation(cancellation_event):
        audio, spoken, _status, voice_used, engine_used = NovaVoiceEngineTTS().speak(**arguments)
    if cancellation_event is not None and cancellation_event.is_set():
        raise InterruptedError("Revoice cancelled.")

    directory = _nova_audio_output_dir()
    prefix = _safe_audio_prefix(f"NovoLokoRevoice_{engine}")
    stamp = time.strftime("%Y%m%d_%H%M%S")
    filename = f"{prefix}_{stamp}_{time.time_ns() % 1_000_000:06d}.wav"
    audio_path = _managed_history_path(directory, filename, (".wav",))
    metadata_path = _managed_history_path(directory, os.path.splitext(filename)[0] + ".json", (".json",))
    temporary_metadata = metadata_path + ".partial"
    try:
        duration = _write_history_audio(audio, audio_path)
        metadata = dict(original)
        metadata.update({
            "filename": filename,
            "label": spoken,
            "voice": str(voice_used),
            "voice_code": _voice_code(str(voice_used)),
            "engine": str(engine_used),
            "revoice_prompt_source": prompt_mode,
            "created": time.time(),
            "duration": duration,
            "has_audio": True,
            "media_only": False,
        })
        with open(temporary_metadata, "w", encoding="utf-8") as handle:
            json.dump(metadata, handle, ensure_ascii=False, indent=2)
        os.replace(temporary_metadata, metadata_path)
    except BaseException:
        for path in (temporary_metadata, metadata_path, audio_path):
            try:
                if os.path.exists(path):
                    os.remove(path)
            except OSError:
                pass
        raise
    entry = next(
        (item for item in _audio_history_entries() if item.get("filename") == filename),
        None,
    )
    if entry is None:
        raise RuntimeError("Revoice audio was created but its Media Studio entry could not be loaded.")
    return entry


class NovaVoicePrompt:
    """Microphone-enabled prompt source. Recording/transcription is handled by the NovoLoko frontend extension."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": ("STRING", {"default": "", "multiline": True}),
                "insert_mode": (["Replace", "Append", "Insert at Cursor"], {"default": "Append"}),
                "stt_model": (
                    ["tiny.en", "base.en", "small.en", "medium.en", "tiny", "base", "small", "medium", "distil-large-v3", "turbo"],
                    {"default": "small.en"},
                ),
                "language": (
                    ["Auto", "English", "Japanese", "Korean", "Chinese", "German", "French", "Spanish", "Italian", "Portuguese"],
                    {"default": "English"},
                ),
                "device": (["Auto", "CUDA", "CPU"], {"default": "Auto"}),
                "auto_stop": ("BOOLEAN", {"default": True}),
                "silence_seconds": ("FLOAT", {"default": 1.6, "min": 0.5, "max": 10.0, "step": 0.1}),
                "trim_fillers": ("BOOLEAN", {"default": True}),
                "punctuation_mode": (["Natural Speech", "Comma Prompt"], {"default": "Comma Prompt"}),
                "enabled": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                "local_model_path": ("STRING", {"default": "", "multiline": False}),
                "compute_type": (["Auto", "float16", "int8_float16", "int8", "float32"], {"default": "Auto"}),
                "translate_to_english": ("BOOLEAN", {"default": False}),
                "vad_filter": ("BOOLEAN", {"default": True}),
                "prompt_hint": (
                    "STRING",
                    {
                        "default": "ComfyUI image prompt, cinematic lighting, anime, photorealistic, character, clothing, camera angle",
                        "multiline": True,
                    },
                ),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt", "voice_status")
    FUNCTION = "build"
    CATEGORY = "NovoLoko/Voice"

    def build(self, prompt="", enabled=True, **kwargs):
        if not enabled:
            return ("", "NovoLoko Voice Prompt disabled")
        text = str(prompt or "").strip()
        return (text, "NovoLoko Voice Prompt ready" if text else "NovoLoko Voice Prompt is empty")


class NovaPromptSpeechSelector:
    """Select Manual, Enhanced, or Prompt Stack + Enhanced.

    Existing workflows using the old Manual Prompt / Enhanced Prompt labels
    remain accepted and are normalised automatically.
    """

    SOURCE_OPTIONS = ["Manual", "Enhanced", "Prompt Stack + Enhanced"]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "source": (cls.SOURCE_OPTIONS, {"default": "Prompt Stack + Enhanced"}),
            },
            "optional": {
                "manual_prompt": ("STRING", {"forceInput": True}),
                "enhanced_prompt": ("STRING", {"forceInput": True}),
                "prompt_stack": ("STRING", {"forceInput": True}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = (
        "selected_prompt",
        "manual_prompt",
        "enhanced_prompt",
        "source",
        "prompt_stack",
    )
    FUNCTION = "select"
    CATEGORY = "NovoLoko/Prompt"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @staticmethod
    def _clean(value):
        return str(value or "").strip()

    @classmethod
    def _normalise_source(cls, value):
        clean = cls._clean(value).lower()
        if clean.startswith("manual"):
            return "Manual"
        if clean.startswith("enhanced"):
            return "Enhanced"
        if "stack" in clean and "enhanc" in clean:
            return "Prompt Stack + Enhanced"
        return "Prompt Stack + Enhanced"

    @staticmethod
    def _join_unique(parts):
        output = []
        seen = set()
        for part in parts:
            clean = str(part or "").strip()
            key = " ".join(clean.lower().split())
            if clean and key not in seen:
                output.append(clean)
                seen.add(key)
        return "\n\n".join(output)

    def select(
        self,
        source="Prompt Stack + Enhanced",
        manual_prompt="",
        enhanced_prompt="",
        prompt_stack="",
        **kwargs,
    ):
        choice = self._normalise_source(source or kwargs.get("speak"))
        manual = self._clean(manual_prompt)
        enhanced = self._clean(enhanced_prompt)
        stack = self._clean(prompt_stack)

        if choice == "Manual":
            selected = manual
            fallbacks = [(stack, "Prompt Stack"), (enhanced, "Enhanced")]
        elif choice == "Enhanced":
            selected = enhanced
            fallbacks = [(manual, "Manual"), (stack, "Prompt Stack")]
        else:
            selected = self._join_unique([stack, enhanced])
            fallbacks = [(enhanced, "Enhanced"), (stack, "Prompt Stack"), (manual, "Manual")]

        selected_source = choice
        if not selected:
            for fallback, fallback_name in fallbacks:
                if fallback:
                    selected = fallback
                    selected_source = f"{fallback_name} (fallback)"
                    break

        return (selected, manual, enhanced, selected_source, stack)


class NovaKokoroTTS:
    """Real local Kokoro TTS. Downloads the official model/voice on first use and returns ComfyUI AUDIO."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"default": "NovoLoko Voice is ready.", "multiline": True}),
                "voice": (KOKORO_VOICES, {"default": "af_nova | NovoLoko (US Female)"}),
                "speed": ("FLOAT", {"default": 1.0, "min": 0.5, "max": 2.0, "step": 0.05}),
                "device": (["Auto", "CUDA", "CPU"], {"default": "Auto"}),
                "enabled": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "prefix": ("STRING", {"default": "", "multiline": False}),
                "max_characters": ("INT", {"default": 2000, "min": 20, "max": 10000}),
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
        voice="af_nova | NovoLoko (US Female)",
        speed=1.0,
        device="Auto",
        enabled=True,
        prefix="",
        max_characters=2000,
    ):
        if not enabled:
            return (_silent_audio(), "", "NovoLoko Kokoro TTS disabled", str(voice or ""))

        spoken = " ".join(str(text or "").split()).strip()
        pre = str(prefix or "").strip()
        if pre:
            spoken = f"{pre} {spoken}".strip()
        spoken = spoken[: max(20, int(max_characters or 2000))].strip()
        if not spoken:
            return (_silent_audio(), "", "No text supplied to NovoLoko Kokoro TTS", str(voice or ""))

        voice_code = str(voice or "af_nova").split("|", 1)[0].strip()
        lang_code = "b" if voice_code.startswith("b") else "a"
        pipeline, actual_device = _kokoro_pipeline(lang_code, device)

        try:
            import numpy as np
            import torch

            chunks = []
            for _, _, audio in pipeline(
                spoken,
                voice=voice_code,
                speed=float(speed),
                split_pattern=r"\n+",
            ):
                if audio is None:
                    continue
                if isinstance(audio, torch.Tensor):
                    tensor = audio.detach().to("cpu", dtype=torch.float32).flatten()
                else:
                    tensor = torch.from_numpy(np.asarray(audio, dtype=np.float32)).flatten()
                if tensor.numel():
                    chunks.append(tensor)

            if not chunks:
                raise RuntimeError("Kokoro returned no audio samples.")

            if len(chunks) > 1:
                gap = torch.zeros(int(24000 * 0.12), dtype=torch.float32)
                joined = []
                for index, chunk in enumerate(chunks):
                    if index:
                        joined.append(gap)
                    joined.append(chunk)
                waveform = torch.cat(joined)
            else:
                waveform = chunks[0]

            audio_out = {"waveform": waveform.unsqueeze(0).unsqueeze(0), "sample_rate": 24000}
            status = (
                f"Generated {waveform.numel() / 24000:.2f}s with {voice_code} "
                f"on {actual_device}. First use downloads Kokoro-82M and the selected voice."
            )
            return (audio_out, spoken, status, str(voice or voice_code))
        except Exception as exc:
            raise RuntimeError(
                f"NovoLoko Kokoro TTS failed: {exc}. "
                "Run INSTALL_NOVA_VOICE_AND_KOKORO.bat and restart ComfyUI."
            ) from exc




class NovaAudioAutoplayTrigger:
    """Play Kokoro audio when the selected generation pass becomes available.

    The image sockets are lazy. Only the selected trigger pass is requested, so
    choosing First Pass does not wait for a connected Second Pass branch.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "audio": ("AUDIO",),
                "trigger_after": (
                    ["After Audio Ready", "After First Pass", "After Second Pass"],
                    {"default": "After First Pass"},
                ),
                "enabled": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "first_pass_image": ("IMAGE", {"forceInput": True, "lazy": True}),
                "second_pass_image": ("IMAGE", {"forceInput": True, "lazy": True}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("status",)
    FUNCTION = "trigger"
    CATEGORY = "NovoLoko/Voice"
    OUTPUT_NODE = True

    @classmethod
    def check_lazy_status(
        cls,
        audio,
        trigger_after="After First Pass",
        enabled=True,
        first_pass_image=_MISSING_LAZY,
        second_pass_image=_MISSING_LAZY,
    ):
        if not enabled:
            return []
        choice = str(trigger_after or "").lower()
        if "first" in choice and first_pass_image is None:
            return ["first_pass_image"]
        if "second" in choice and second_pass_image is None:
            return ["second_pass_image"]
        return []

    def trigger(
        self,
        audio,
        trigger_after="After First Pass",
        enabled=True,
        first_pass_image=_MISSING_LAZY,
        second_pass_image=_MISSING_LAZY,
    ):
        if not enabled:
            return {"ui": {"nova_autoplay_trigger": [{"enabled": False}]}, "result": ("Autoplay trigger disabled",)}
        filename, duration = _save_autoplay_audio(audio)
        info = {
            "enabled": True,
            "filename": filename,
            "duration": duration,
            "trigger_after": str(trigger_after or "After First Pass"),
            "created": time.time(),
        }
        return {
            "ui": {"nova_autoplay_trigger": [info]},
            "result": (f"Autoplay ready after {info['trigger_after']} ({duration:.2f}s)",),
        }


class NovaAudioHistoryPlayer:
    """Save Kokoro audio with first/second-pass images and provide an integrated media history UI."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "filename_prefix": ("STRING", {"default": "NovoLokoVoiceKokoro", "multiline": False}),
                "autoplay": ("BOOLEAN", {"default": True}),
                "loop": ("BOOLEAN", {"default": False}),
                "history_limit": ("INT", {"default": 1000, "min": 1, "max": 5000}),
            },
            "optional": {
                # Audio is optional so this node can also be an image-only gallery.
                # Keep it first in the optional socket list for workflow compatibility.
                "audio": ("AUDIO",),
                "label": ("STRING", {"forceInput": True}),
                "voice_name": ("STRING", {"forceInput": True}),
                "image": ("IMAGE", {"forceInput": True}),
                "manual_prompt": ("STRING", {"forceInput": True}),
                "enhanced_prompt": ("STRING", {"forceInput": True}),
                "image_first_pass": ("IMAGE", {"forceInput": True}),
                "image_second_pass": ("IMAGE", {"forceInput": True}),
                "preview_image": (
                    ["Auto - Second if available", "First Pass", "Second Pass"],
                    {"default": "Auto - Second if available"},
                ),
                "history_image_resolution": (
                    ["Original (full resolution)", "16384 max", "8192 max", "4096 max", "2048 max"],
                    {"default": "Original (full resolution)"},
                ),
                "negative_prompt": ("STRING", {"forceInput": True}),
                "prompt_source": ("STRING", {"forceInput": True}),
                "prompt_stack_summary": ("STRING", {"forceInput": True}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("AUDIO", "STRING", "STRING", "IMAGE")
    RETURN_NAMES = ("audio", "saved_filename", "status", "selected_image")
    FUNCTION = "save_and_show"
    CATEGORY = "NovoLoko/Voice"
    OUTPUT_NODE = True

    def save_and_show(
        self,
        audio=None,
        filename_prefix="NovoLokoVoiceKokoro",
        autoplay=True,
        loop=False,
        history_limit=1000,
        preview_image="Auto - Second if available",
        history_image_resolution="Original (full resolution)",
        label="",
        voice_name="",
        image=None,
        image_first_pass=None,
        image_second_pass=None,
        manual_prompt="",
        enhanced_prompt="",
        negative_prompt="",
        prompt_source="",
        prompt_stack_summary="",
        prompt=None,
        extra_pnginfo=None,
        unique_id=None,
    ):
        has_audio = bool(
            audio
            and isinstance(audio, dict)
            and "waveform" in audio
            and "sample_rate" in audio
        )
        has_image = any(
            value is not None
            for value in (image, image_first_pass, image_second_pass)
        )
        if not has_audio and not has_image:
            raise ValueError(
                "NovoLoko Media Studio needs an AUDIO input or at least one IMAGE input."
            )

        try:
            import torch
        except Exception as exc:
            raise RuntimeError("NovoLoko Media Studio needs PyTorch.") from exc

        directory = _nova_audio_output_dir()
        prefix = _safe_audio_prefix(filename_prefix)
        if not has_audio and prefix == "NovoLokoVoiceKokoro":
            prefix = "NovoLokoGallery"
        stamp = time.strftime("%Y%m%d_%H%M%S")
        fraction = f"{time.time_ns() % 1_000_000_000:09d}"[:3]
        mode_suffix = "" if has_audio else "_image"
        filename = f"{prefix}{mode_suffix}_{stamp}_{fraction}.wav"
        full_path = os.path.join(directory, filename)

        if has_audio:
            try:
                import numpy as np
                import soundfile as sf
            except Exception as exc:
                raise RuntimeError(
                    "Audio saving needs soundfile and NumPy. "
                    "Run INSTALL_NOVA_VOICE_AND_KOKORO.bat."
                ) from exc

            waveform = audio["waveform"]
            sample_rate = int(audio["sample_rate"])
            if isinstance(waveform, torch.Tensor):
                tensor = waveform.detach().to("cpu", dtype=torch.float32)
                data = tensor.numpy()
            else:
                data = np.asarray(waveform, dtype=np.float32)

            if data.ndim == 3:
                data = data[0]
            if data.ndim == 2:
                data = data.T
            elif data.ndim != 1:
                data = data.reshape(-1)

            sf.write(full_path, data, sample_rate, subtype="PCM_16")
            sample_count = int(data.shape[0]) if getattr(data, "ndim", 1) >= 1 else 0
            duration = float(sample_count / sample_rate) if sample_rate > 0 else 0.0
            audio_output = audio
        else:
            import wave
            sample_rate = 24000
            frames = max(1, int(sample_rate * 0.05))
            with wave.open(full_path, "wb") as handle:
                handle.setnchannels(1)
                handle.setsampwidth(2)
                handle.setframerate(sample_rate)
                handle.writeframes(b"\x00\x00" * frames)
            duration = 0.0
            audio_output = _silent_audio(0.05)
        clean_label = str(label or "").strip()
        clean_manual = str(manual_prompt or "").strip()
        clean_enhanced = str(enhanced_prompt or "").strip()
        clean_negative = str(negative_prompt or "").strip()
        clean_source = str(prompt_source or "").strip()
        clean_stack = str(prompt_stack_summary or "").strip()
        clean_voice = " ".join(str(voice_name or "").split()).strip()[:200]
        stem = os.path.splitext(filename)[0]
        first_image = image_first_pass if image_first_pass is not None else image
        second_image = image_second_pass
        resolution_choice = str(history_image_resolution or "Original (full resolution)").strip()
        max_side_map = {
            "16384 max": 16384,
            "8192 max": 8192,
            "4096 max": 4096,
            "2048 max": 2048,
        }
        history_max_side = max_side_map.get(resolution_choice, 0)
        metadata_fields = build_metadata_fields(
            prompt=prompt,
            extra_pnginfo=extra_pnginfo,
            unique_id=unique_id,
            positive_prompt=clean_label,
            negative_prompt=clean_negative,
            prompt_source=clean_source,
            prompt_stack_summary=clean_stack,
            manual_prompt=clean_manual,
            enhanced_prompt=clean_enhanced,
            include_prompt=True,
            include_workflow=True,
            additional={
                "nova_history_image_resolution": resolution_choice,
                "nova_voice": clean_voice,
                "nova_media_only": not has_audio,
                "nova_has_audio": has_audio,
            },
        )
        first_fields = dict(metadata_fields)
        first_fields["nova_pass"] = "first"
        second_fields = dict(metadata_fields)
        second_fields["nova_pass"] = "second"
        first_audit = _save_history_image(
            first_image, f"{stem}_pass1", history_max_side, first_fields
        )
        second_audit = _save_history_image(
            second_image, f"{stem}_pass2", history_max_side, second_fields
        )
        image_first_filename = str(first_audit.get("filename") or "")
        image_second_filename = str(second_audit.get("filename") or "")
        preview_choice = str(preview_image or "Auto - Second if available").strip()
        if preview_choice.lower().startswith("first"):
            image_filename = image_first_filename or image_second_filename
            selected_image = first_image if first_image is not None else second_image
        elif preview_choice.lower().startswith("second"):
            image_filename = image_second_filename or image_first_filename
            selected_image = second_image if second_image is not None else first_image
        else:
            image_filename = image_second_filename or image_first_filename
            selected_image = second_image if second_image is not None else first_image

        # Keep the IMAGE output type-safe even when Media Studio is used for
        # audio-only history. The black 1×1 fallback is never saved unless the
        # user deliberately connects it downstream.
        if selected_image is None:
            selected_image = torch.zeros((1, 1, 1, 3), dtype=torch.float32)
        metadata = {
            "filename": filename,
            "label": clean_label[:50000],
            "manual_prompt": clean_manual[:50000],
            "enhanced_prompt": clean_enhanced[:50000],
            "negative_prompt": clean_negative[:50000],
            "prompt_source": clean_source[:2000],
            "prompt_stack_summary": clean_stack[:50000],
            "voice": clean_voice,
            "voice_code": _voice_code(clean_voice),
            "image_filename": image_filename,
            "image_first_filename": image_first_filename,
            "image_second_filename": image_second_filename,
            "preview_image": preview_choice,
            "history_image_resolution": resolution_choice,
            "image_first_source_width": int(first_audit.get("source_width") or 0),
            "image_first_source_height": int(first_audit.get("source_height") or 0),
            "image_first_width": int(first_audit.get("saved_width") or 0),
            "image_first_height": int(first_audit.get("saved_height") or 0),
            "image_first_capped": bool(first_audit.get("capped")),
            "image_second_source_width": int(second_audit.get("source_width") or 0),
            "image_second_source_height": int(second_audit.get("source_height") or 0),
            "image_second_width": int(second_audit.get("saved_width") or 0),
            "image_second_height": int(second_audit.get("saved_height") or 0),
            "image_second_capped": bool(second_audit.get("capped")),
            "created": time.time(),
            "duration": duration,
            "sample_rate": sample_rate,
            "has_audio": bool(has_audio),
            "media_only": bool(not has_audio),
        }
        try:
            with open(_audio_metadata_path(full_path), "w", encoding="utf-8") as handle:
                json.dump(metadata, handle, ensure_ascii=False, indent=2)
        except Exception:
            pass

        entry = {
            "filename": filename,
            "label": metadata["label"],
            "voice": metadata["voice"],
            "voice_code": metadata["voice_code"],
            "manual_prompt": metadata["manual_prompt"],
            "enhanced_prompt": metadata["enhanced_prompt"],
            "negative_prompt": metadata["negative_prompt"],
            "prompt_source": metadata["prompt_source"],
            "prompt_stack_summary": metadata["prompt_stack_summary"],
            "image_filename": metadata["image_filename"],
            "image_first_filename": metadata["image_first_filename"],
            "image_second_filename": metadata["image_second_filename"],
            "preview_image": metadata["preview_image"],
            "history_image_resolution": metadata["history_image_resolution"],
            "image_first_source_width": metadata["image_first_source_width"],
            "image_first_source_height": metadata["image_first_source_height"],
            "image_first_width": metadata["image_first_width"],
            "image_first_height": metadata["image_first_height"],
            "image_first_capped": metadata["image_first_capped"],
            "image_second_source_width": metadata["image_second_source_width"],
            "image_second_source_height": metadata["image_second_source_height"],
            "image_second_width": metadata["image_second_width"],
            "image_second_height": metadata["image_second_height"],
            "image_second_capped": metadata["image_second_capped"],
            "created": metadata["created"],
            "size": os.path.getsize(full_path),
            "duration": duration,
            "has_audio": metadata["has_audio"],
            "media_only": metadata["media_only"],
        }
        history = _audio_history_entries(history_limit)
        if has_audio:
            status = (
                f"Saved {filename} ({duration:.2f}s) with "
                f"{len(history)} media item(s) in NovoLoko history."
            )
        else:
            status = (
                f"Saved image-only gallery entry {image_filename or filename} "
                f"with {len(history)} media item(s) in NovoLoko history."
            )
        ui_payload = {
            "nova_audio_latest": [entry],
            "nova_audio_history": history,
            "nova_audio_autoplay": [bool(autoplay)],
            "nova_audio_loop": [bool(loop)],
        }
        if has_audio:
            ui_payload["audio"] = [{
                "filename": filename,
                "subfolder": "NovoLokoVoice/Audio",
                "type": "output",
            }]
        return {
            "ui": ui_payload,
            "result": (audio_output, filename, status, selected_image),
        }


# Compatibility marker retained below.


class NovaKokoroSpeechBridge:
    """Compatibility text-only bridge. It does not generate audio; use NovaKokoroTTS for real speech."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "what_to_say": (
                    ["Final Prompt", "Style Selection", "Character Selection", "Style + Character", "Warning", "Custom"],
                    {"default": "Final Prompt"},
                ),
                "prefix": ("STRING", {"default": "", "multiline": False}),
                "max_characters": ("INT", {"default": 1200, "min": 20, "max": 10000}),
                "enabled": ("BOOLEAN", {"default": True}),
                "custom_text": ("STRING", {"default": "", "multiline": True}),
            },
            "optional": {
                "final_prompt": ("STRING", {"forceInput": True}),
                "style_text": ("STRING", {"forceInput": True}),
                "character_text": ("STRING", {"forceInput": True}),
                "warning_text": ("STRING", {"forceInput": True}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("speech_text", "status")
    FUNCTION = "build_speech"
    CATEGORY = "NovoLoko/Voice"

    def build_speech(
        self,
        what_to_say="Final Prompt",
        prefix="",
        max_characters=1200,
        enabled=True,
        custom_text="",
        final_prompt="",
        style_text="",
        character_text="",
        warning_text="",
    ):
        if not enabled:
            return ("", "NovoLoko Kokoro Speech Bridge disabled")

        choices = {
            "Final Prompt": str(final_prompt or ""),
            "Style Selection": str(style_text or ""),
            "Character Selection": str(character_text or ""),
            "Style + Character": ", ".join(
                item.strip() for item in [str(style_text or ""), str(character_text or "")] if item.strip()
            ),
            "Warning": str(warning_text or ""),
            "Custom": str(custom_text or ""),
        }
        body = choices.get(what_to_say, str(final_prompt or "")).strip()
        pre = str(prefix or "").strip()
        speech = " ".join(item for item in [pre, body] if item).strip()
        limit = max(20, int(max_characters or 1200))
        if len(speech) > limit:
            speech = speech[: max(1, limit - 1)].rstrip(" ,.;:") + "…"
        status = f"Prepared {len(speech)} text characters only; connect to a TTS node" if speech else "No speech text received"
        return (speech, status)


NODE_CLASS_MAPPINGS = {
    "NovaVoicePrompt": NovaVoicePrompt,
    "NovaPromptSpeechSelector": NovaPromptSpeechSelector,
    "NovaKokoroTTS": NovaKokoroTTS,
    "NovaAudioAutoplayTrigger": NovaAudioAutoplayTrigger,
    "NovaAudioHistoryPlayer": NovaAudioHistoryPlayer,
    "NovaKokoroSpeechBridge": NovaKokoroSpeechBridge,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NovaVoicePrompt": "NovoLoko Voice Prompt — Speech to Text",
    "NovaPromptSpeechSelector": "NovoLoko Prompt Source Selector",
    "NovaKokoroTTS": "NovoLoko Kokoro TTS",
    "NovaAudioAutoplayTrigger": "NovoLoko Autoplay Trigger",
    "NovaAudioHistoryPlayer": "NovoLoko Media Studio",
    "NovaKokoroSpeechBridge": "NovoLoko Kokoro Text Bridge",
}


# Optional web routes. Import failures are deliberately contained so existing NovoLoko nodes always keep loading.
try:
    from aiohttp import web
    from server import PromptServer

    @PromptServer.instance.routes.get("/nova_voice/status")
    async def nova_voice_status(request):
        stt_installed = False
        stt_version = ""
        stt_error = ""
        kokoro_installed = False
        kokoro_version = ""
        kokoro_error = ""

        try:
            import faster_whisper
            stt_installed = True
            stt_version = getattr(faster_whisper, "__version__", "installed")
        except Exception as exc:
            stt_error = str(exc) or "faster-whisper is not installed"

        try:
            import kokoro
            from kokoro import KPipeline  # noqa: F401
            kokoro_installed = True
            kokoro_version = getattr(kokoro, "__version__", "installed")
        except Exception as exc:
            kokoro_error = str(exc) or "Kokoro is not installed"

        return web.json_response({
            "ok": True,
            "installed": stt_installed,
            "version": stt_version,
            "stt_installed": stt_installed,
            "stt_version": stt_version,
            "stt_error": stt_error,
            "kokoro_installed": kokoro_installed,
            "kokoro_version": kokoro_version,
            "kokoro_error": kokoro_error,
            "nova_voice_version": NOVA_VOICE_VERSION,
            "install_hint": "Run INSTALL_NOVA_VOICE_AND_KOKORO.bat and restart ComfyUI.",
        })



    @PromptServer.instance.routes.get("/nova_voice/audio/history")
    async def nova_voice_audio_history(request):
        try:
            limit = max(1, min(int(request.query.get("limit", "1000")), 5000))
        except Exception:
            limit = 1000
        return web.json_response({"ok": True, "items": _audio_history_entries(limit)})

    @PromptServer.instance.routes.get("/nova_voice/voices")
    async def nova_voice_voices(request):
        from .lokobridge_nodes import _voice_options

        return web.json_response({
            "ok": True,
            "omniloko": _voice_options(force_refresh=True),
            "kokoro": list(KOKORO_VOICES),
        })

    @PromptServer.instance.routes.post("/nova_voice/audio/delete")
    async def nova_voice_audio_delete(request):
        try:
            data = await request.json()
            result = await asyncio.to_thread(_delete_history_entry, data.get("filename"))
            return web.json_response({"ok": True, **result})
        except (ValueError, FileNotFoundError) as exc:
            return web.json_response({"ok": False, "error": str(exc)}, status=400)
        except Exception as exc:
            return web.json_response({"ok": False, "error": str(exc) or "The history entry could not be deleted."}, status=500)

    @PromptServer.instance.routes.post("/nova_voice/audio/revoice")
    async def nova_voice_audio_revoice(request):
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "Invalid revoice request."}, status=400)
        request_id = str(data.get("requestId") or "").strip()
        if not request_id or len(request_id) > 128 or not re.fullmatch(r"[A-Za-z0-9_-]+", request_id):
            return web.json_response({"ok": False, "error": "A valid revoice request ID is required."}, status=400)
        cancellation_event = threading.Event()
        with _REVOICE_JOBS_LOCK:
            if request_id in _REVOICE_JOBS:
                return web.json_response({"ok": False, "error": "That revoice request is already active."}, status=409)
            _REVOICE_JOBS[request_id] = cancellation_event
        try:
            entry = await asyncio.to_thread(_revoice_history_entry, data, cancellation_event)
            return web.json_response({"ok": True, "item": entry})
        except (InterruptedError, KeyboardInterrupt):
            return web.json_response({"ok": False, "cancelled": True, "error": "Revoice cancelled."}, status=409)
        except (ValueError, FileNotFoundError) as exc:
            return web.json_response({"ok": False, "error": str(exc)}, status=400)
        except Exception as exc:
            return web.json_response({"ok": False, "error": str(exc) or "Revoice failed."}, status=500)
        finally:
            with _REVOICE_JOBS_LOCK:
                _REVOICE_JOBS.pop(request_id, None)

    @PromptServer.instance.routes.post("/nova_voice/audio/revoice/cancel")
    async def nova_voice_audio_revoice_cancel(request):
        try:
            data = await request.json()
        except Exception:
            data = {}
        request_id = str(data.get("requestId") or "").strip()
        with _REVOICE_JOBS_LOCK:
            cancellation_event = _REVOICE_JOBS.get(request_id)
        if cancellation_event is None:
            return web.json_response({"ok": True, "accepted": False})
        cancellation_event.set()
        return web.json_response({"ok": True, "accepted": True})

    @PromptServer.instance.routes.get("/nova_voice/audio/file")
    async def nova_voice_audio_file(request):
        filename = os.path.basename(str(request.query.get("filename", "")).strip())
        if not filename or not filename.lower().endswith((".wav", ".flac", ".mp3", ".ogg", ".opus")):
            return web.json_response({"ok": False, "error": "Invalid audio filename."}, status=400)
        directory = os.path.realpath(_nova_audio_output_dir())
        full_path = os.path.realpath(os.path.join(directory, filename))
        if os.path.dirname(full_path) != directory or not os.path.isfile(full_path):
            return web.json_response({"ok": False, "error": "Audio file was not found."}, status=404)
        response = web.FileResponse(full_path)
        response.headers["Cache-Control"] = "no-store"
        return response

    @PromptServer.instance.routes.get("/nova_voice/image/info")
    async def nova_voice_image_info(request):
        filename = os.path.basename(str(request.query.get("filename", "")).strip())
        directory = os.path.realpath(_nova_audio_image_dir())
        full_path = os.path.realpath(os.path.join(directory, filename))
        if os.path.dirname(full_path) != directory or not os.path.isfile(full_path):
            return web.json_response({"ok": False, "error": "History image was not found."}, status=404)
        try:
            from PIL import Image
            with Image.open(full_path) as image:
                width, height = image.size
            return web.json_response({"ok": True, "width": width, "height": height, "bytes": os.path.getsize(full_path)})
        except Exception as exc:
            return web.json_response({"ok": False, "error": str(exc)}, status=500)

    @PromptServer.instance.routes.get("/nova_voice/image/file")
    async def nova_voice_image_file(request):
        filename = os.path.basename(str(request.query.get("filename", "")).strip())
        if not filename or not filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            return web.json_response({"ok": False, "error": "Invalid image filename."}, status=400)
        directory = os.path.realpath(_nova_audio_image_dir())
        full_path = os.path.realpath(os.path.join(directory, filename))
        if os.path.dirname(full_path) != directory or not os.path.isfile(full_path):
            return web.json_response({"ok": False, "error": "History image was not found."}, status=404)
        response = web.FileResponse(full_path)
        response.headers["Cache-Control"] = "no-store"
        return response


    @PromptServer.instance.routes.get("/nova_voice/autoplay/file")
    async def nova_voice_autoplay_file(request):
        filename = os.path.basename(str(request.query.get("filename", "")).strip())
        if not filename or not filename.lower().endswith(".wav"):
            return web.json_response({"ok": False, "error": "Invalid autoplay filename."}, status=400)
        directory = os.path.realpath(_nova_autoplay_temp_dir())
        full_path = os.path.realpath(os.path.join(directory, filename))
        if os.path.dirname(full_path) != directory or not os.path.isfile(full_path):
            return web.json_response({"ok": False, "error": "Autoplay file was not found."}, status=404)
        response = web.FileResponse(full_path)
        response.headers["Cache-Control"] = "no-store"
        return response

    @PromptServer.instance.routes.post("/nova_voice/open_folder")
    async def nova_voice_open_folder(request):
        try:
            data = await request.json()
        except Exception:
            data = {}
        kind = str(data.get("kind") or "audio")
        filename = str(data.get("filename") or "")
        reveal = _bool(data.get("reveal"), False)
        try:
            opened = await asyncio.to_thread(_open_known_folder, kind, filename, reveal)
            return web.json_response({"ok": True, "path": opened})
        except Exception as exc:
            return web.json_response({"ok": False, "error": str(exc) or "Folder could not be opened."}, status=500)


    @PromptServer.instance.routes.post("/nova_voice/transcribe")
    async def nova_voice_transcribe(request):
        temp_path: Optional[str] = None
        try:
            reader = await request.multipart()
            fields: Dict[str, str] = {}
            audio_part = None

            while True:
                part = await reader.next()
                if part is None:
                    break
                if part.name == "audio":
                    audio_part = part
                    filename = part.filename or "nova_voice.webm"
                    suffix = os.path.splitext(filename)[1].lower() or ".webm"
                    if suffix not in {".webm", ".ogg", ".wav", ".mp3", ".m4a", ".mp4"}:
                        suffix = ".webm"
                    handle = tempfile.NamedTemporaryFile(prefix="nova_voice_", suffix=suffix, delete=False)
                    temp_path = handle.name
                    size = 0
                    try:
                        while True:
                            chunk = await part.read_chunk(size=1024 * 256)
                            if not chunk:
                                break
                            size += len(chunk)
                            if size > 50 * 1024 * 1024:
                                raise ValueError("Voice recording is larger than the 50 MB safety limit.")
                            handle.write(chunk)
                    finally:
                        handle.close()
                else:
                    fields[part.name] = await part.text()

            if audio_part is None or not temp_path or not os.path.exists(temp_path):
                return web.json_response({"ok": False, "error": "No audio recording was received."}, status=400)
            if os.path.getsize(temp_path) < 100:
                return web.json_response({"ok": False, "error": "The audio recording was empty."}, status=400)

            result = await asyncio.to_thread(
                _transcribe_file,
                temp_path,
                fields.get("stt_model", "small.en"),
                fields.get("local_model_path", ""),
                fields.get("language", "English"),
                _bool(fields.get("translate_to_english"), False),
                fields.get("device", "Auto"),
                fields.get("compute_type", "Auto"),
                _bool(fields.get("vad_filter"), True),
                _bool(fields.get("trim_fillers"), True),
                fields.get("punctuation_mode", "Comma Prompt"),
                fields.get("prompt_hint", ""),
            )
            return web.json_response({"ok": True, **result})
        except Exception as exc:
            return web.json_response({"ok": False, "error": str(exc)}, status=500)
        finally:
            if temp_path:
                try:
                    os.remove(temp_path)
                except Exception:
                    pass
except Exception as exc:
    print(f"[NovoLoko Voice] Optional web routes were not registered: {exc}")
