from __future__ import annotations

import ctypes
import gc
import hashlib
import math
import os
import platform
import shutil
import subprocess
import random
import re
import secrets
import time
from typing import Any, Dict, Iterable, List, Tuple

import numpy as np
from PIL import Image

try:
    import folder_paths
except Exception:
    folder_paths = None

try:
    import torch
except Exception:
    torch = None

from .nova_metadata import build_metadata_fields, build_pnginfo


NOVA_CORE_VERSION = "3.3.0"
SEED_MAX = 0xFFFFFFFFFFFFFFFF


class AnyType(str):
    def __eq__(self, _other: object) -> bool:
        return True

    def __ne__(self, _other: object) -> bool:
        return False


ANY = AnyType("*")


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _sort_dynamic_text_key(name: str) -> Tuple[int, str]:
    match = re.search(r"(\d+)$", str(name or ""))
    return (int(match.group(1)) if match else 10**9, str(name))


def _safe_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(float(value))
    except Exception:
        parsed = int(default)
    return max(int(minimum), min(int(maximum), parsed))


def _safe_float(value: Any, default: float, minimum: float, maximum: float) -> float:
    try:
        parsed = float(value)
    except Exception:
        parsed = float(default)
    if not math.isfinite(parsed):
        parsed = float(default)
    return max(float(minimum), min(float(maximum), parsed))


def _safe_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1", "yes", "on"}:
            return True
        if lowered in {"false", "0", "no", "off", ""}:
            return False
    if value is None:
        return bool(default)
    return bool(value)


class NovaDynamicTextConcatenate:
    """Unlimited text concatenation with an automatically expanding frontend."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "delimiter": ("STRING", {"default": ", ", "multiline": False}),
                "clean_whitespace": ("BOOLEAN", {"default": True}),
                "skip_empty": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "text_1": ("STRING", {"forceInput": True}),
                "text_2": ("STRING", {"forceInput": True}),
            },
        }

    RETURN_TYPES = ("STRING", "INT")
    RETURN_NAMES = ("combined_text", "used_inputs")
    FUNCTION = "concatenate"
    CATEGORY = "NovoLoko/Text"

    @classmethod
    def VALIDATE_INPUTS(cls, **_kwargs):
        # The frontend adds text_3, text_4, ... dynamically.
        return True

    def concatenate(self, delimiter=", ", clean_whitespace=True, skip_empty=True, **kwargs):
        joiner = "\n" if str(delimiter) in {"\\n", "\n"} else str(delimiter or "")
        values: List[str] = []
        for key in sorted((key for key in kwargs if str(key).startswith("text_")), key=_sort_dynamic_text_key):
            value = kwargs.get(key)
            if value is None:
                continue
            text = str(value)
            if clean_whitespace:
                text = text.strip()
                text = re.sub(r"[ \t]+", " ", text)
                text = re.sub(r" *\n *", "\n", text)
            if skip_empty and not text:
                continue
            values.append(text)
        return (joiner.join(values), len(values))


class NovaSeedLab:
    """Simple, dependable shared seed source with last-seed frontend tools."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mode": (["Random Every Queue", "Fixed"], {"default": "Random Every Queue"}),
                "seed": ("INT", {"default": 0, "min": 0, "max": SEED_MAX}),
                "digits": ("INT", {"default": 16, "min": 3, "max": 16, "step": 1}),
            }
        }

    RETURN_TYPES = ("INT", "STRING")
    RETURN_NAMES = ("seed", "status")
    FUNCTION = "generate"
    CATEGORY = "NovoLoko/Values"

    @classmethod
    def IS_CHANGED(cls, mode="Random Every Queue", seed=0, digits=16, **_kwargs):
        if str(mode) == "Random Every Queue":
            return time.time_ns()
        return (str(mode), int(seed), int(digits))

    @staticmethod
    def _limit_for_digits(digits: int) -> int:
        digits = max(3, min(16, int(digits or 16)))
        if digits >= 16:
            # Keep generated values exactly representable by browser number widgets.
            return min(SEED_MAX + 1, 9_007_199_254_740_992)
        return min(SEED_MAX + 1, 10 ** digits)

    def generate(self, mode="Random Every Queue", seed=0, digits=16):
        if str(mode) == "Random Every Queue":
            actual = secrets.randbelow(max(1, self._limit_for_digits(digits)))
        else:
            actual = max(0, min(SEED_MAX, int(seed or 0)))
        status = f"{mode}: {actual}"
        return {
            "ui": {"nova_seed_lab": [{"seed": str(actual), "mode": str(mode), "status": status}]},
            "result": (actual, status),
        }


class NovaGenerationTimer:
    """Frontend-only workflow timer. Uses wall-clock deltas so tab switching cannot pause it."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    FUNCTION = "noop"
    CATEGORY = "NovoLoko/Utility"

    def noop(self):
        return ()


class NovaPreviewPassThrough:
    """Preview IMAGE or MASK, pass it through, and optionally save to output."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "input": (ANY,),
                "show_preview": ("BOOLEAN", {"default": True}),
                "save_to_output": ("BOOLEAN", {"default": False}),
                "filename_prefix": ("STRING", {"default": "NovoLokoPreview", "multiline": False}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = (ANY, "STRING")
    RETURN_NAMES = ("output", "status")
    FUNCTION = "preview"
    CATEGORY = "NovoLoko/Image"
    OUTPUT_NODE = True

    @staticmethod
    def _arrays(value: Any) -> Iterable[np.ndarray]:
        if torch is not None and isinstance(value, torch.Tensor):
            array = value.detach().to("cpu", dtype=torch.float32).numpy()
        else:
            array = np.asarray(value)

        if array.ndim == 2:
            array = array[None, ...]
        elif array.ndim == 3:
            # MASK batch is B,H,W. IMAGE without batch is H,W,C.
            if array.shape[-1] in (1, 3, 4):
                array = array[None, ...]
        if array.ndim not in (3, 4):
            return []
        return [np.asarray(item) for item in array]

    @staticmethod
    def _to_pil(array: np.ndarray) -> Image.Image:
        array = np.nan_to_num(array, nan=0.0, posinf=1.0, neginf=0.0)
        if array.dtype != np.uint8:
            array = np.clip(array, 0.0, 1.0)
            array = (array * 255.0 + 0.5).astype(np.uint8)
        if array.ndim == 2:
            return Image.fromarray(array, mode="L")
        if array.ndim == 3 and array.shape[-1] == 1:
            return Image.fromarray(array[:, :, 0], mode="L")
        return Image.fromarray(array)

    def preview(
        self,
        input,
        show_preview=True,
        save_to_output=False,
        filename_prefix="NovoLokoPreview",
        prompt=None,
        extra_pnginfo=None,
        unique_id=None,
    ):
        if not show_preview and not save_to_output:
            return {"ui": {}, "result": (input, "Pass-through only; no preview files written.")}
        if folder_paths is None:
            raise RuntimeError("NovoLoko Preview requires ComfyUI folder_paths.")

        images = [self._to_pil(array) for array in self._arrays(input)]
        if not images:
            return {"ui": {}, "result": (input, "Unsupported preview tensor shape; value passed through.")}

        output_type = "output" if save_to_output else "temp"
        output_dir = folder_paths.get_output_directory() if save_to_output else folder_paths.get_temp_directory()
        prefix = str(filename_prefix or "NovoLokoPreview")
        if not save_to_output:
            prefix = f"_nova_preview_{unique_id or 'node'}"

        full_folder, filename, counter, subfolder, _ = folder_paths.get_save_image_path(
            prefix,
            output_dir,
            images[0].width,
            images[0].height,
        )
        os.makedirs(full_folder, exist_ok=True)
        metadata = build_metadata_fields(
            prompt=prompt,
            extra_pnginfo=extra_pnginfo,
            unique_id=unique_id,
            include_prompt=True,
            include_workflow=True,
            additional={"nova_preview_save": output_type},
        )
        records = []
        for index, image in enumerate(images):
            name = f"{filename}_{counter + index:05}_.png"
            image.save(
                os.path.join(full_folder, name),
                format="PNG",
                pnginfo=build_pnginfo(metadata),
                compress_level=2,
            )
            records.append({"filename": name, "subfolder": subfolder, "type": output_type})

        action = "Saved to output" if save_to_output else "Temporary preview"
        status = f"{action}: {len(records)} image(s); pass-through preserved."
        return {"ui": {"images": records, "nova_preview_status": [status]}, "result": (input, status)}


class NovaMemoryManager:
    """Safe current-process RAM/VRAM cleanup with user-selectable depth."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "anything": (ANY,),
                "mode": (["Light", "Balanced", "Deep", "Custom"], {"default": "Balanced"}),
                "unload_models": ("BOOLEAN", {"default": True}),
                "clear_vram": ("BOOLEAN", {"default": True}),
                "collect_python": ("BOOLEAN", {"default": True}),
                "trim_current_process": ("BOOLEAN", {"default": True}),
            }
        }

    RETURN_TYPES = (ANY, "STRING", "FLOAT")
    RETURN_NAMES = ("output", "status", "freed_ram_mb")
    FUNCTION = "cleanup"
    CATEGORY = "NovoLoko/Utility"
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(cls, **_kwargs):
        return time.time_ns()

    @staticmethod
    def _rss_mb() -> float:
        try:
            import psutil
            return float(psutil.Process(os.getpid()).memory_info().rss) / (1024.0 * 1024.0)
        except Exception:
            return 0.0

    @staticmethod
    def _trim_process() -> None:
        system = platform.system()
        if system == "Windows":
            try:
                handle = ctypes.windll.kernel32.GetCurrentProcess()
                ctypes.windll.psapi.EmptyWorkingSet(handle)
            except Exception:
                pass
        elif system == "Linux":
            try:
                ctypes.CDLL("libc.so.6").malloc_trim(0)
            except Exception:
                pass

    def cleanup(
        self,
        anything,
        mode="Balanced",
        unload_models=True,
        clear_vram=True,
        collect_python=True,
        trim_current_process=True,
    ):
        preset = str(mode or "Balanced")
        if preset == "Light":
            unload_models, clear_vram, collect_python, trim_current_process = False, True, True, False
        elif preset == "Balanced":
            unload_models, clear_vram, collect_python, trim_current_process = True, True, True, False
        elif preset == "Deep":
            unload_models, clear_vram, collect_python, trim_current_process = True, True, True, True

        before = self._rss_mb()
        notes = []
        try:
            import comfy.model_management as model_management
            if unload_models:
                model_management.unload_all_models()
                notes.append("models unloaded")
            if clear_vram:
                model_management.soft_empty_cache()
                notes.append("Comfy cache cleared")
        except Exception as error:
            notes.append(f"Comfy cleanup unavailable: {error}")

        if collect_python:
            collected = gc.collect()
            notes.append(f"Python GC {collected}")

        if clear_vram and torch is not None:
            try:
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                    try:
                        torch.cuda.ipc_collect()
                    except Exception:
                        pass
                    notes.append("CUDA cache cleared")
            except Exception as error:
                notes.append(f"CUDA cleanup skipped: {error}")

        if trim_current_process:
            self._trim_process()
            notes.append("current process trimmed")

        after = self._rss_mb()
        freed = max(0.0, before - after) if before and after else 0.0
        status = f"NovoLoko Memory {preset}: " + "; ".join(notes)
        if before and after:
            status += f"; RSS {before:.0f} → {after:.0f} MB"
        return (anything, status, float(freed))


PROMPT_PRESETS: Dict[str, str] = {
    "Quick Prompt (30–60 words)": (
        "Rewrite the raw idea as a very compact, faithful image prompt. Preserve the "
        "requested subject, action, identity, setting, colours and essential composition. "
        "Add only the most useful lighting and visual details; avoid padding and repetition."
    ),
    "Compact Prompt (60–110 words)": (
        "Rewrite the raw idea as a concise, faithful image prompt. Preserve every important "
        "subject, action, identity, relationship, colour and setting request. Add controlled "
        "composition, lighting, materials and atmosphere without over-describing."
    ),
    "Faithful Rich Image": (
        "Rewrite the raw idea into one vivid, production-ready image prompt. Preserve every requested subject, action, "
        "relationship, identity, exact phrase, colour, setting and visual reference. Add only details that strengthen the "
        "same concept: composition, camera/viewpoint, lighting, materials, textures, foreground, background, depth and mood."
    ),
    "Edit Preserve": (
        "Write an image-edit prompt that changes only what the user asks to change. Explicitly preserve identity, facial "
        "features, body proportions, pose, framing, clothing, lighting, colour palette and background unless the request "
        "directly changes one of them. Avoid creative substitutions."
    ),
    "Cinematic": (
        "Expand the idea as a coherent cinematic still with intentional shot size, lens character, blocking, lighting, "
        "production design, depth and atmosphere while staying faithful to the requested content."
    ),
    "Product / Fashion": (
        "Create a clean commercial prompt with accurate materials, stitching, logos, garment construction or product "
        "geometry, controlled lighting, composition and premium finish. Do not invent conflicting branding."
    ),
    "Character Consistency": (
        "Prioritise recognisable character continuity: stable face, hair, age, outfit, proportions, signature details and "
        "silhouette. Add environment and lighting without diluting identity."
    ),
    "Custom": "Follow the custom instructions exactly while preserving the user's raw idea.",
}

DETAIL_TARGETS = {
    "Very Short": (
        "Keep the finished prompt exceptionally compact: roughly 30 to 60 words. "
        "Use one tight paragraph and include only the most important visual details."
    ),
    "Short": (
        "Keep the finished prompt brief: roughly 60 to 110 words. "
        "Prioritise subject, action, composition, lighting and the key setting details."
    ),
    "Concise": "Aim for roughly 80 to 160 words.",
    "Rich": "Aim for roughly 150 to 320 words.",
    "Maximum": "Aim for roughly 300 to 550 words without repetition.",
}

PRESET_DETAIL_OVERRIDES = {
    "Quick Prompt (30–60 words)": "Very Short",
    "Compact Prompt (60–110 words)": "Short",
}


class NovaPromptEnhancer:
    """NovoLoko prompt enhancer built directly on ComfyUI's generative CLIP interface."""

    DESCRIPTION = (
        "Turns a short idea into one finished image prompt. The node clamps malformed "
        "or migrated widget values on first run, so older workflows cannot fail because "
        "creativity, length, seed, or Boolean values loaded outside the current range."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": (
                    "CLIP",
                    {
                        "tooltip": (
                            "Connect a generative text CLIP, such as the Qwen/Krea2 CLIP. "
                            "A normal image-only CLIP cannot generate text."
                        )
                    },
                ),
                "idea": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "dynamicPrompts": True,
                        "tooltip": (
                            "The raw idea to improve. Keep important names, actions, colours, "
                            "relationships, camera requests, and exact wording here."
                        ),
                    },
                ),
                "enabled": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "tooltip": "Off bypasses the enhancer and returns the raw idea unchanged.",
                    },
                ),
                "preset": (
                    list(PROMPT_PRESETS.keys()),
                    {
                        "default": "Faithful Rich Image",
                        "tooltip": (
                            "Quick and Compact create shorter faithful prompts; Faithful Rich keeps "
                            "the same concept with more detail; Edit Preserve changes only requested "
                            "details; Cinematic strengthens shot design; Product/Fashion prioritises "
                            "materials and construction; Character Consistency protects identity; "
                            "Custom follows the custom instructions."
                        ),
                    },
                ),
                "detail_level": (
                    list(DETAIL_TARGETS.keys()),
                    {
                        "default": "Rich",
                        "tooltip": (
                            "Very Short targets 30–60 words, Short 60–110, Concise 80–160, "
                            "Rich 150–320, and Maximum 300–550. This is a writing target, "
                            "not a hard token count."
                        ),
                    },
                ),
                "creativity": (
                    "FLOAT",
                    {
                        "default": 0.65,
                        "min": 0.01,
                        "max": 2.0,
                        "step": 0.01,
                        "tooltip": (
                            "Sampling temperature. Around 0.45–0.75 is faithful, 0.8–1.1 is "
                            "more inventive, and very high values can wander or repeat."
                        ),
                    },
                ),
                "max_length": (
                    "INT",
                    {
                        "default": 1200,
                        "min": 32,
                        "max": 32768,
                        "step": 1,
                        "tooltip": (
                            "Maximum generation token budget. This is not a word count. "
                            "About 700–1400 is plenty for most image prompts."
                        ),
                    },
                ),
                "seed": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": SEED_MAX,
                        "tooltip": (
                            "Controls text-generation sampling. Reusing the same seed and settings "
                            "usually produces a similar rewrite."
                        ),
                    },
                ),
                "thinking": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "tooltip": (
                            "Allows supported models to reason internally before returning the final "
                            "prompt. Unsupported models normally ignore it."
                        ),
                    },
                ),
                "use_default_template": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "tooltip": (
                            "Uses the CLIP model's built-in chat/template formatting. Leave this on "
                            "for Qwen/Krea2 unless that specific model requires raw prompting."
                        ),
                    },
                ),
            },
            "optional": {
                "image": (
                    "IMAGE",
                    {
                        "forceInput": True,
                        "tooltip": (
                            "Optional visual reference. The enhancer grounds descriptions in the "
                            "image and preserves visible details unless the idea requests changes."
                        ),
                    },
                ),
                "custom_instructions": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "tooltip": (
                            "Used only when Preset is Custom. The text is saved while another "
                            "preset is active, but it is not sent to the model until Custom is selected."
                        ),
                    },
                ),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("enhanced_prompt", "instructions_used", "status")
    FUNCTION = "enhance"
    CATEGORY = "NovoLoko/Prompt"

    @classmethod
    def VALIDATE_INPUTS(cls, **_kwargs):
        # Old workflow widget arrays occasionally load one step outside a new range.
        # Execution sanitises every value below instead of rejecting the first queue.
        return True

    @staticmethod
    def _instruction(idea: str, preset: str, detail_level: str, image_connected: bool, custom: str) -> str:
        rules = PROMPT_PRESETS.get(preset, PROMPT_PRESETS["Faithful Rich Image"])
        effective_detail = PRESET_DETAIL_OVERRIDES.get(preset, detail_level)
        detail = DETAIL_TARGETS.get(effective_detail, DETAIL_TARGETS["Rich"])
        reference = (
            "A reference image is supplied. Use visible details as grounding and preserve them unless the raw request explicitly changes them."
            if image_connected else
            "No reference image is supplied. Do not invent a different core subject or concept."
        )
        custom_text = _clean_text(custom) if preset == "Custom" else ""
        custom_block = (
            f"\nCUSTOM INSTRUCTIONS — follow these exactly: {custom_text}"
            if custom_text else ""
        )
        return (
            "You are NovoLoko Prompt Enhancer. Produce exactly ONE finished image-generation prompt in flowing natural English. "
            "Output only the prompt: no headings, analysis, bullets, quotes, alternatives or commentary. "
            "Keep the result visually concrete and easy for an image model to parse. "
            f"{rules} {detail} {reference}{custom_block}\n\nRAW IDEA:\n{idea.strip()}"
        )

    def enhance(
        self,
        clip,
        idea="",
        enabled=True,
        preset="Faithful Rich Image",
        detail_level="Rich",
        creativity=0.65,
        max_length=1200,
        seed=0,
        thinking=True,
        use_default_template=True,
        image=None,
        custom_instructions="",
    ):
        raw = _clean_text(idea)
        enabled = _safe_bool(enabled, True)
        preset = str(preset) if str(preset) in PROMPT_PRESETS else "Faithful Rich Image"
        detail_level = str(detail_level) if str(detail_level) in DETAIL_TARGETS else "Rich"
        creativity = _safe_float(creativity, 0.65, 0.01, 2.0)
        max_length = _safe_int(max_length, 1200, 32, 32768)
        seed = _safe_int(seed, 0, 0, SEED_MAX)
        thinking = _safe_bool(thinking, True)
        use_default_template = _safe_bool(use_default_template, True)

        if not enabled or not raw:
            status = "Enhancer bypassed." if not enabled else "No idea supplied."
            return (raw, "", status)

        instruction = self._instruction(raw, preset, detail_level, image is not None, custom_instructions)
        if not hasattr(clip, "tokenize") or not hasattr(clip, "generate") or not hasattr(clip, "decode"):
            raise RuntimeError(
                "The connected CLIP does not provide text generation. Connect the same "
                "generative Qwen/Krea2 CLIP that works with ComfyUI Generate Text."
            )

        tokens = clip.tokenize(
            instruction,
            image=image,
            skip_template=not use_default_template,
            min_length=1,
            thinking=thinking,
        )
        generated_ids = clip.generate(
            tokens,
            do_sample=True,
            max_length=max_length,
            temperature=creativity,
            top_k=64,
            top_p=0.95,
            min_p=0.05,
            repetition_penalty=1.05,
            presence_penalty=0.0,
            seed=seed,
        )
        output = clip.decode(generated_ids)
        if isinstance(output, (list, tuple)):
            output = output[0] if output else ""
        enhanced = str(output or "").strip()
        enhanced = re.sub(r"^```(?:text)?\s*|\s*```$", "", enhanced, flags=re.IGNORECASE | re.DOTALL).strip()
        if len(enhanced) >= 2 and enhanced[0] == enhanced[-1] and enhanced[0] in {'"', "'"}:
            enhanced = enhanced[1:-1].strip()
        custom_state = (
            "custom instructions active"
            if preset == "Custom" and _clean_text(custom_instructions)
            else (
                "custom instructions ignored"
                if preset != "Custom" and _clean_text(custom_instructions)
                else "no custom instructions"
            )
        )
        effective_detail = PRESET_DETAIL_OVERRIDES.get(preset, detail_level)
        status = (
            f"NovoLoko enhanced {len(raw)} → {len(enhanced)} characters using "
            f"{preset} / {effective_detail}; {custom_state}; creativity {creativity:g}; "
            f"max {max_length}; seed {seed}."
        )
        return (enhanced or raw, instruction, status)


class NovaTextDisplay:
    """Plain resizable text output with pass-through."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"forceInput": True}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "show"
    CATEGORY = "NovoLoko/Text"
    OUTPUT_NODE = True

    def show(self, text=""):
        clean = str(text or "")
        return {
            "ui": {"nova_text_display": [{"text": clean}]},
            "result": (clean,),
        }


# ---------------------------------------------------------------------------
# NovoLoko Generation Timer custom sounds
# ---------------------------------------------------------------------------
_TIMER_SOUND_EXTENSIONS = {".wav", ".mp3", ".ogg", ".m4a", ".aac", ".flac", ".opus"}
_TIMER_SOUND_MAX_BYTES = 25 * 1024 * 1024


def _nova_timer_sound_dir() -> str:
    if folder_paths is not None:
        base = folder_paths.get_input_directory()
    else:
        base = os.path.join(os.path.dirname(os.path.realpath(__file__)), "user_sounds")
    directory = os.path.realpath(os.path.join(base, "NovoLokoTimerSounds"))
    os.makedirs(directory, exist_ok=True)
    return directory


def _safe_timer_sound_filename(value: Any) -> str:
    name = os.path.basename(str(value or "").strip())
    stem, extension = os.path.splitext(name)
    extension = extension.lower()
    if extension not in _TIMER_SOUND_EXTENSIONS:
        raise ValueError("Unsupported sound type. Use WAV, MP3, OGG, M4A, AAC, FLAC or OPUS.")
    stem = re.sub(r"[^A-Za-z0-9._ -]+", "_", stem).strip(" ._") or "NovaTimerSound"
    return f"{stem[:96]}{extension}"


def _safe_timer_sound_relative_path(value: Any) -> str:
    """Validate a relative sound path while preserving user folder names."""
    raw = str(value or "").strip().replace("\\", "/")
    if not raw or raw.startswith("/") or re.match(r"^[A-Za-z]:", raw):
        raise ValueError("A relative timer sound path is required.")

    parts = []
    for part in raw.split("/"):
        part = part.strip()
        if not part or part == ".":
            continue
        if part == "..":
            raise ValueError("Parent-folder paths are not allowed.")
        if any(character in part for character in ("\x00", "\r", "\n")):
            raise ValueError("Invalid timer sound path.")
        parts.append(part)

    if not parts:
        raise ValueError("A timer sound filename is required.")

    relative = "/".join(parts)
    extension = os.path.splitext(parts[-1])[1].lower()
    if extension not in _TIMER_SOUND_EXTENSIONS:
        raise ValueError("Unsupported sound type. Use WAV, MP3, OGG, M4A, AAC, FLAC or OPUS.")
    return relative


def _timer_sound_full_path(relative_path: Any) -> Tuple[str, str]:
    directory = _nova_timer_sound_dir()
    relative = _safe_timer_sound_relative_path(relative_path)
    full_path = os.path.realpath(os.path.join(directory, *relative.split("/")))
    if os.path.commonpath([directory, full_path]) != directory:
        raise ValueError("Timer sound path escapes NovoLokoTimerSounds.")
    return relative, full_path


def _unique_timer_sound_path(filename: str) -> Tuple[str, str]:
    directory = _nova_timer_sound_dir()
    safe_name = _safe_timer_sound_filename(filename)
    stem, extension = os.path.splitext(safe_name)
    candidate = safe_name
    counter = 2
    while os.path.exists(os.path.join(directory, candidate)):
        candidate = f"{stem}_{counter}{extension}"
        counter += 1
    return directory, candidate


def _nova_timer_sound_cache_dir() -> str:
    try:
        if folder_paths is not None:
            root = folder_paths.get_temp_directory()
        else:
            root = os.path.join(_nova_timer_sound_dir(), ".nova_cache")
    except Exception:
        root = os.path.join(_nova_timer_sound_dir(), ".nova_cache")
    directory = os.path.realpath(os.path.join(root, "NovoLokoTimerSoundsCache"))
    os.makedirs(directory, exist_ok=True)
    return directory


def _normalised_timer_sound_path(source_path: str) -> Tuple[str, bool]:
    """Return a browser-safe PCM16 WAV whenever conversion is available."""
    source_path = os.path.realpath(source_path)
    stat = os.stat(source_path)
    signature = f"{source_path}|{stat.st_mtime_ns}|{stat.st_size}".encode("utf-8")
    digest = hashlib.sha256(signature).hexdigest()[:24]
    cache_path = os.path.join(_nova_timer_sound_cache_dir(), f"{digest}.wav")
    if os.path.isfile(cache_path) and os.path.getsize(cache_path) > 44:
        return cache_path, True

    temporary = cache_path + ".tmp.wav"
    try:
        import numpy as np
        import soundfile as sf

        data, sample_rate = sf.read(
            source_path,
            dtype="float32",
            always_2d=True,
        )
        if data.size <= 0 or int(sample_rate) <= 0:
            raise ValueError("The sound contains no decodable samples.")
        if data.shape[1] > 2:
            data = np.mean(data, axis=1, keepdims=True)
        data = np.nan_to_num(data, nan=0.0, posinf=1.0, neginf=-1.0)
        data = np.clip(data, -1.0, 1.0)
        sf.write(
            temporary,
            data,
            int(sample_rate),
            subtype="PCM_16",
            format="WAV",
        )
        os.replace(temporary, cache_path)
        return cache_path, True
    except Exception:
        try:
            if os.path.exists(temporary):
                os.remove(temporary)
        except OSError:
            pass

    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        try:
            command = [
                ffmpeg,
                "-hide_banner",
                "-loglevel", "error",
                "-y",
                "-i", source_path,
                "-vn",
                "-ac", "2",
                "-ar", "48000",
                "-c:a", "pcm_s16le",
                temporary,
            ]
            subprocess.run(
                command,
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=45,
            )
            if os.path.isfile(temporary) and os.path.getsize(temporary) > 44:
                os.replace(temporary, cache_path)
                return cache_path, True
        except Exception:
            try:
                if os.path.exists(temporary):
                    os.remove(temporary)
            except OSError:
                pass

    return source_path, False


try:
    from aiohttp import web
    from server import PromptServer

    @PromptServer.instance.routes.get("/nova_timer/sounds")
    async def nova_timer_sounds(_request):
        directory = _nova_timer_sound_dir()
        items = []
        for root, folder_names, file_names in os.walk(directory):
            folder_names[:] = sorted(
                [
                    name for name in folder_names
                    if not name.startswith(".") and name != "__pycache__"
                ],
                key=str.lower,
            )
            for name in sorted(file_names, key=str.lower):
                if os.path.splitext(name)[1].lower() not in _TIMER_SOUND_EXTENSIONS:
                    continue
                full_path = os.path.join(root, name)
                relative = os.path.relpath(full_path, directory).replace(os.sep, "/")
                folder = os.path.dirname(relative).replace(os.sep, "/")
                label = os.path.splitext(os.path.basename(relative))[0]
                display = " › ".join(
                    [part for part in folder.split("/") if part] + [label]
                )
                items.append({
                    "filename": relative,
                    "label": label,
                    "folder": folder,
                    "display": display,
                    "bytes": os.path.getsize(full_path),
                })
        items.sort(key=lambda item: str(item.get("display") or "").lower())
        return web.json_response({
            "ok": True,
            "items": items,
            "folder": directory,
            "recursive": True,
            "max_upload_bytes": _TIMER_SOUND_MAX_BYTES,
        })

    @PromptServer.instance.routes.get("/nova_timer/sound")
    async def nova_timer_sound_file(request):
        try:
            filename, full_path = _timer_sound_full_path(
                request.query.get("filename", "")
            )
            if not os.path.isfile(full_path):
                raise FileNotFoundError(filename)
            playback_path, normalised = await __import__("asyncio").to_thread(
                _normalised_timer_sound_path,
                full_path,
            )
            response = web.FileResponse(playback_path)
            response.headers["Cache-Control"] = "no-store"
            response.headers["X-Nova-Sound-Normalised"] = "1" if normalised else "0"
            response.headers["X-Nova-Original-Filename"] = filename
            return response
        except Exception as exc:
            return web.json_response({"ok": False, "error": str(exc)}, status=404)

    @PromptServer.instance.routes.post("/nova_timer/sounds/upload")
    async def nova_timer_sound_upload(request):
        try:
            reader = await request.multipart()
            uploaded_name = ""
            chunks = []
            total = 0

            while True:
                part = await reader.next()
                if part is None:
                    break
                if part.name != "sound":
                    continue
                uploaded_name = part.filename or "NovaTimerSound.wav"
                while True:
                    chunk = await part.read_chunk(size=256 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > _TIMER_SOUND_MAX_BYTES:
                        raise ValueError("Sound file is larger than 25 MB.")
                    chunks.append(chunk)

            if not chunks:
                raise ValueError("No sound file was supplied.")

            directory, filename = _unique_timer_sound_path(uploaded_name)
            full_path = os.path.join(directory, filename)
            with open(full_path, "wb") as handle:
                for chunk in chunks:
                    handle.write(chunk)

            return web.json_response({
                "ok": True,
                "filename": filename,
                "label": os.path.splitext(filename)[0],
                "bytes": total,
                "folder": directory,
            })
        except Exception as exc:
            return web.json_response({"ok": False, "error": str(exc)}, status=400)

    @PromptServer.instance.routes.post("/nova_timer/sounds/open_folder")
    async def nova_timer_sound_open_folder(_request):
        try:
            directory = _nova_timer_sound_dir()
            if platform.system() == "Windows":
                os.startfile(directory)  # type: ignore[attr-defined]
            elif platform.system() == "Darwin":
                __import__("subprocess").Popen(["open", directory])
            else:
                __import__("subprocess").Popen(["xdg-open", directory])
            return web.json_response({"ok": True, "folder": directory})
        except Exception as exc:
            return web.json_response({"ok": False, "error": str(exc)}, status=500)

except Exception as exc:
    print(f"[ComfyUI-NovoLoko] Timer sound routes unavailable: {exc}")



NODE_CLASS_MAPPINGS = {
    "NovaDynamicTextConcatenate": NovaDynamicTextConcatenate,
    "NovaSeedLab": NovaSeedLab,
    "NovaGenerationTimer": NovaGenerationTimer,
    "NovaPreviewPassThrough": NovaPreviewPassThrough,
    "NovaMemoryManager": NovaMemoryManager,
    "NovaPromptEnhancer": NovaPromptEnhancer,
    "NovaTextDisplay": NovaTextDisplay,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NovaDynamicTextConcatenate": "NovoLoko Text Concatenate — Auto Expand",
    "NovaSeedLab": "NovoLoko Seed Lab — Random / Fixed / History",
    "NovaGenerationTimer": "NovoLoko Generation Timer",
    "NovaPreviewPassThrough": "NovoLoko Preview — Pass Through / Optional Save",
    "NovaMemoryManager": "NovoLoko Memory Manager — RAM + VRAM",
    "NovaPromptEnhancer": "NovoLoko Prompt Enhancer Pro",
    "NovaTextDisplay": "NovoLoko Text Display",
}
