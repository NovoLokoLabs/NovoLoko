"""Runtime safety guard for NovoLoko Media Studio queue completion.

Media Studio is a history/preview node. The full-resolution generation is already
saved by the dedicated NovoLoko Save Image nodes, so this layer keeps its own
history copies bounded and fast enough that they cannot hold the ComfyUI queue
for minutes while Pillow compresses large PNGs or the node serializes an
unbounded history payload.
"""

from __future__ import annotations

import os
import time
from typing import Any, Dict, Optional

from . import voice_nodes as _voice
from .nova_metadata import build_pnginfo

_SAFE_ORIGINAL_MAX_SIDE = 4096
_MAX_HISTORY_ITEMS = 200
_MAX_UI_TEXT = 8000


def _throw_if_interrupted() -> None:
    try:
        import comfy.model_management as model_management

        checker = getattr(model_management, "throw_exception_if_processing_interrupted", None)
        if callable(checker):
            checker()
    except ImportError:
        return


def _safe_metadata(metadata_fields: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Keep useful history metadata without duplicating a huge workflow blob."""
    if not isinstance(metadata_fields, dict):
        return {}
    output: Dict[str, Any] = {}
    for key, value in metadata_fields.items():
        name = str(key)
        if name.casefold() in {"workflow", "prompt"}:
            continue
        text = str(value) if value is not None else ""
        output[name] = text[:_MAX_UI_TEXT]
    output["nova_media_studio_history_copy"] = "true"
    output["nova_media_studio_full_metadata_location"] = "NovoLoko Save Image output"
    return output


def _fast_save_history_image(
    image: Any,
    stem: str,
    max_size: int = 0,
    metadata_fields: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    empty = {
        "filename": "",
        "source_width": 0,
        "source_height": 0,
        "saved_width": 0,
        "saved_height": 0,
        "capped": False,
    }
    if image is None:
        return empty

    _throw_if_interrupted()
    started = time.monotonic()
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
    requested_cap = int(max_size or 0)
    effective_cap = requested_cap if requested_cap > 0 else _SAFE_ORIGINAL_MAX_SIDE
    capped = False
    if max(pil.size) > effective_cap:
        scale = float(effective_cap) / float(max(pil.size))
        pil = pil.resize(
            (max(1, round(pil.width * scale)), max(1, round(pil.height * scale))),
            Image.Resampling.LANCZOS,
        )
        capped = True

    filename = f"{stem}.png"
    directory = _voice._nova_audio_image_dir()
    full_path = os.path.join(directory, filename)
    temporary_path = full_path + ".tmp"
    try:
        pil.save(
            temporary_path,
            format="PNG",
            pnginfo=build_pnginfo(_safe_metadata(metadata_fields)),
            compress_level=0,
        )
        _throw_if_interrupted()
        os.replace(temporary_path, full_path)
    finally:
        try:
            if os.path.exists(temporary_path):
                os.remove(temporary_path)
        except OSError:
            pass

    elapsed = time.monotonic() - started
    if elapsed >= 5:
        print(
            f"[ComfyUI-NovoLoko] Media Studio history image {filename} "
            f"saved in {elapsed:.1f}s ({source_width}x{source_height} -> {pil.width}x{pil.height})."
        )
    return {
        "filename": filename,
        "source_width": source_width,
        "source_height": source_height,
        "saved_width": int(pil.width),
        "saved_height": int(pil.height),
        "capped": bool(capped),
    }


def _bounded_history_entries(limit: int = 1000) -> list[Dict[str, Any]]:
    _throw_if_interrupted()
    entries = _ORIGINAL_HISTORY_ENTRIES(min(max(1, int(limit or 1)), _MAX_HISTORY_ITEMS))
    for entry in entries:
        for key in (
            "label",
            "manual_prompt",
            "enhanced_prompt",
            "negative_prompt",
            "prompt_stack_summary",
        ):
            if key in entry:
                entry[key] = str(entry.get(key) or "")[:_MAX_UI_TEXT]
    _throw_if_interrupted()
    return entries


def _compact_input_types():
    definition = _ORIGINAL_INPUT_TYPES()
    required = definition.get("required", {})
    optional = definition.get("optional", {})
    if "history_limit" in required:
        required["history_limit"] = (
            "INT",
            {"default": 100, "min": 1, "max": _MAX_HISTORY_ITEMS},
        )
    elif "history_limit" in optional:
        optional["history_limit"] = (
            "INT",
            {"default": 100, "min": 1, "max": _MAX_HISTORY_ITEMS},
        )
    if "history_image_resolution" in optional:
        choices = optional["history_image_resolution"][0]
        optional["history_image_resolution"] = (
            choices,
            {"default": "2048 max"},
        )
    return definition


_ORIGINAL_SAVE_HISTORY_IMAGE = _voice._save_history_image
_ORIGINAL_HISTORY_ENTRIES = _voice._audio_history_entries
_ORIGINAL_INPUT_TYPES = _voice.NovaAudioHistoryPlayer.INPUT_TYPES

_voice._save_history_image = _fast_save_history_image
_voice._audio_history_entries = _bounded_history_entries
_voice.NovaAudioHistoryPlayer.INPUT_TYPES = classmethod(lambda cls: _compact_input_types())

print(
    "[ComfyUI-NovoLoko] Media Studio queue guard active: "
    f"history <= {_MAX_HISTORY_ITEMS}, legacy Original capped at {_SAFE_ORIGINAL_MAX_SIDE}px."
)
