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
from collections import OrderedDict
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


NOVA_CORE_VERSION = "4.6.4"
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


class NovaControlPanelSwitch:
    """Compact workflow switches for optional voice and prompt stages."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "tts_enabled": (
                    "BOOLEAN",
                    {"default": False, "label_on": "On", "label_off": "Off"},
                ),
                "enhancer_enabled": (
                    "BOOLEAN",
                    {"default": False, "label_on": "On", "label_off": "Off"},
                ),
            }
        }

    RETURN_TYPES = ("BOOLEAN", "BOOLEAN", "STRING")
    RETURN_NAMES = ("tts_enabled", "enhancer_enabled", "status")
    FUNCTION = "switch"
    CATEGORY = "NovoLoko/Values"

    def switch(self, tts_enabled=False, enhancer_enabled=False):
        tts = bool(tts_enabled)
        enhancer = bool(enhancer_enabled)
        return (
            tts,
            enhancer,
            f"TTS: {'On' if tts else 'Off'} | Enhancer: {'On' if enhancer else 'Off'}",
        )


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
                "mode": (
                    ["Light", "Balanced", "Deep", "Custom", "Fast Batch / Reuse"],
                    {
                        "default": "Balanced",
                        "tooltip": "Fast Batch / Reuse keeps models and caches resident between songs. Switch to Balanced once at the end of the batch.",
                    },
                ),
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
        started = time.perf_counter()
        if preset == "Fast Batch / Reuse":
            unload_models, clear_vram, collect_python, trim_current_process = False, False, False, False
        elif preset == "Light":
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
        if not notes:
            notes.append("models and caches kept resident for consecutive songs")
        status = f"NovoLoko Memory {preset}: " + "; ".join(notes)
        if before and after:
            status += f"; RSS {before:.0f} → {after:.0f} MB"
        status += f"; cleanup stage {time.perf_counter() - started:.3f}s"
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


PROMPT_TASK_MODES = (
    "Auto",
    "Krea2 / Image",
    "MiniMax H3 Standard",
    "MiniMax H3 Full Reference",
    "MiniMax H3 Director",
)

# Values from the first H3-capable release remain accepted so workflows saved
# during that release continue to queue even before the frontend migrates them.
PROMPT_TASK_MODE_ALIASES = {
    "Auto": "Auto",
    "Image": "Krea2 / Image",
    "Krea2 / Image": "Krea2 / Image",
    "H3 Standard": "MiniMax H3 Standard",
    "MiniMax H3 Standard": "MiniMax H3 Standard",
    "H3 Full Reference": "MiniMax H3 Full Reference",
    "MiniMax H3 Full Reference": "MiniMax H3 Full Reference",
    "H3 Director": "MiniMax H3 Director",
    "MiniMax H3 Director": "MiniMax H3 Director",
}

PROMPT_TASK_MODE_TARGETS = {
    "Krea2 / Image": "Image",
    "MiniMax H3 Standard": "H3 Standard",
    "MiniMax H3 Full Reference": "H3 Full Reference",
    "MiniMax H3 Director": "H3 Director",
}

H3_LENGTH_BEHAVIORS: Dict[str, str] = {
    "Preserve": (
        "Preserve the source prompt's overall length and level of detail. Do not summarise, "
        "truncate, collapse, or pad the prompt."
    ),
    "Compact": (
        "Make the prompt more compact only by removing repetition and tightening wording. "
        "Keep every field, heading, reference label, selected instruction, timing cue, "
        "continuity requirement, and audio instruction."
    ),
    "Detailed": (
        "Add useful production detail inside the existing structure where it improves clarity, "
        "chronology, camera language, physical coherence, continuity, or audio direction. "
        "Do not invent a conflicting subject, event, reference, or story beat."
    ),
}

H3_MODE_LABELS = {
    "H3 Standard": "H3 STANDARD",
    "H3 Full Reference": "H3 FULL REFERENCE",
    "H3 Director": "H3 DIRECTOR",
}


class NovaPromptEnhancer:
    """NovoLoko prompt enhancer built directly on ComfyUI's generative CLIP interface."""

    _fixed_seed_cache: "OrderedDict[tuple[Any, ...], tuple[str, str]]" = OrderedDict()
    _fixed_seed_cache_limit = 32

    DESCRIPTION = (
        "Enhances image prompts and structured MiniMax H3 video prompts. Auto detects H3 "
        "Standard, Full Reference, or Director prompts and never mixes the image core into "
        "an H3 request. Older workflow values are still sanitised on first run."
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
                            "In Image mode this is used only with the Custom preset. In H3 mode "
                            "it is appended after the H3 preservation core."
                        ),
                    },
                ),
                # Keep new widget inputs after custom_instructions. This preserves the
                # serialized widget order used by existing NovoLoko workflows.
                "task_mode": (
                    list(PROMPT_TASK_MODES),
                    {
                        # Old AIO workflows predate this widget. Default them to
                        # the original Krea2/image core instead of auto-detecting.
                        "default": "Krea2 / Image",
                        "tooltip": (
                            "Select the model/prompt format being enhanced. Auto detects MiniMax "
                            "H3 structures; Krea2 / Image preserves the original image core."
                        ),
                    },
                ),
                "h3_length_behavior": (
                    list(H3_LENGTH_BEHAVIORS.keys()),
                    {
                        "default": "Preserve",
                        "tooltip": (
                            "H3 only: Preserve keeps the source length, Compact removes "
                            "repetition, and Detailed adds useful production detail. Image "
                            "mode continues to use Length Preset."
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
    def _image_instruction(idea: str, preset: str, detail_level: str, image_connected: bool, custom: str) -> str:
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
            "MODE: IMAGE\n"
            "You are NovoLoko Prompt Enhancer. Produce exactly ONE finished image-generation prompt in flowing natural English. "
            "Output only the prompt: no headings, analysis, bullets, quotes, alternatives or commentary. "
            "Keep the result visually concrete and easy for an image model to parse. "
            f"{rules} {detail} {reference}{custom_block}\n\nRAW IDEA:\n{idea.strip()}"
        )

    @staticmethod
    def _detect_h3_mode(idea: str) -> str:
        """Return the most specific H3 mode detected from structural field markers."""
        text = str(idea or "")
        director_markers = (
            r"^\s*SCENE\s+1\b",
            r"^\s*HANDOFF\s+TO\s+NEXT\s+SCENE\b",
            r"^\s*CONTINUE\s+FROM\s+PREVIOUS\s+SCENE\b",
            r"^\s*FINAL\s+SHOT\b",
        )
        full_reference_markers = (
            r"^\s*subject_definitions\s*:",
            r"^\s*retention_analysis\s*:",
            r"^\s*detailed_description\s*:",
        )
        standard_markers = (
            r"^\s*integrated_multimodal_description\s*:",
            r"^\s*overall_soundscape\s*:",
            r"^\s*non_diegetic_music\s*:",
        )
        flags = re.IGNORECASE | re.MULTILINE
        if any(re.search(pattern, text, flags=flags) for pattern in director_markers):
            return "H3 Director"
        if any(re.search(pattern, text, flags=flags) for pattern in full_reference_markers):
            return "H3 Full Reference"
        if any(re.search(pattern, text, flags=flags) for pattern in standard_markers):
            return "H3 Standard"
        return "Image"

    @classmethod
    def _resolve_task_mode(cls, idea: str, task_mode: str) -> str:
        requested = PROMPT_TASK_MODE_ALIASES.get(
            str(task_mode or "Krea2 / Image"),
            "Krea2 / Image",
        )
        if requested == "Auto":
            return cls._detect_h3_mode(idea)
        return PROMPT_TASK_MODE_TARGETS.get(requested, "Image")

    @staticmethod
    def _h3_instruction(
        idea: str,
        resolved_mode: str,
        h3_length_behavior: str,
        custom: str,
    ) -> str:
        mode_label = H3_MODE_LABELS.get(resolved_mode, "H3 STANDARD")
        mode_rules = {
            "H3 Standard": (
                "Treat this as an H3 Standard prompt. Preserve structured fields such as "
                "integrated_multimodal_description, overall_soundscape, and non_diegetic_music."
            ),
            "H3 Full Reference": (
                "Treat this as an H3 Full Reference prompt. Preserve subject_definitions, "
                "retention_analysis, detailed_description, identity anchors, and all reference "
                "retention requirements."
            ),
            "H3 Director": (
                "Treat this as an H3 Director sequence. Preserve every scene heading and beat, "
                "including SCENE sections, CONTINUE FROM PREVIOUS SCENE, HANDOFF TO NEXT SCENE, "
                "and FINAL SHOT continuity anchors wherever they occur."
            ),
        }.get(resolved_mode, "Treat this as a structured MiniMax H3 video prompt.")
        length_rule = H3_LENGTH_BEHAVIORS.get(
            h3_length_behavior,
            H3_LENGTH_BEHAVIORS["Preserve"],
        )
        custom_text = _clean_text(custom)
        custom_block = (
            f"\n\nCUSTOM INSTRUCTIONS - apply these after all preservation rules:\n{custom_text}"
            if custom_text else ""
        )
        return (
            f"MODE: {mode_label}\n"
            "You are NovoLoko Prompt Enhancer Pro operating in MiniMax H3 VIDEO mode. "
            "The input is already a video prompt. Improve clarity, chronology, camera language, "
            "physical coherence, motion, continuity, and production quality without changing "
            "the user's intended content.\n\n"
            "PRESERVATION RULES:\n"
            "- Keep every existing field name, heading, section, and their ordering.\n"
            "- Keep reference labels such as <Picture N>, <Subject N>, <Video N>, and <Audio N> "
            "exactly associated with their intended subjects and media.\n"
            "- Preserve CSV-selected snippets and instructions, timing, duration, chronology, "
            "continuity, transitions, camera choreography, physical cause and effect, dialogue, "
            "sound effects, ambience, soundscape, and music instructions.\n"
            "- Do not convert the input into a still-image task, flatten its structure, "
            "remove H3 fields, summarise it, or impose an image-prompt word target.\n"
            "- Rewrite and polish the wording throughout the prompt; do not merely echo the "
            "input unchanged. Integrate compatible instructions into the correct fields.\n"
            "- If SHOT RULES or SELECTED H3 DIRECTION sections exist, retain their headings "
            "and content even when their instructions are also integrated into other fields.\n"
            "- Return only the complete enhanced H3 prompt, with no analysis, wrapper, preface, "
            "alternatives, or commentary.\n\n"
            f"MODE-SPECIFIC RULES:\n{mode_rules}\n\n"
            f"H3 LENGTH BEHAVIOR - {h3_length_behavior.upper()}:\n{length_rule}"
            f"{custom_block}\n\nINPUT H3 VIDEO PROMPT:\n{idea.strip()}"
        )

    @classmethod
    def _instruction(
        cls,
        idea: str,
        preset: str,
        detail_level: str,
        image_connected: bool,
        custom: str,
        resolved_mode: str = "Image",
        h3_length_behavior: str = "Preserve",
    ) -> str:
        if resolved_mode in H3_MODE_LABELS:
            return cls._h3_instruction(
                idea,
                resolved_mode,
                h3_length_behavior,
                custom,
            )
        return cls._image_instruction(
            idea,
            preset,
            detail_level,
            image_connected,
            custom,
        )

    @staticmethod
    def _h3_preservation_violations(
        source: str,
        candidate: str,
        length_behavior: str = "Preserve",
    ) -> List[str]:
        """Reject structurally destructive H3 output without blocking a real rewrite."""
        source_text = str(source or "").strip()
        candidate_text = str(candidate or "").strip()
        if not candidate_text:
            return ["empty generated prompt"]

        violations: List[str] = []
        letter_count = sum(character.isalpha() for character in candidate_text)
        if letter_count < max(20, int(len(candidate_text) * 0.08)):
            violations.append("unreadable or non-text output")

        minimum_ratio = 0.25 if length_behavior == "Compact" else 0.60
        if source_text and len(candidate_text) < int(len(source_text) * minimum_ratio):
            violations.append("rewrite is unexpectedly truncated")

        field_names = (
            "integrated_multimodal_description",
            "subject_definitions",
            "summary",
            "retention_analysis",
            "detailed_description",
            "sound_effects",
            "overall_soundscape",
            "non_diegetic_music",
        )
        field_pattern = re.compile(
            rf"^\s*({'|'.join(field_names)})\s*:(.*)$",
            flags=re.IGNORECASE | re.MULTILINE,
        )
        source_fields = [match.group(1).lower() for match in field_pattern.finditer(source_text)]
        candidate_fields = [match.group(1).lower() for match in field_pattern.finditer(candidate_text)]
        if source_fields != candidate_fields:
            violations.append("field names or order")

        reference_pattern = re.compile(
            r"<(?:Picture|Subject|Video|Audio)\s+\d+>",
            flags=re.IGNORECASE,
        )
        missing_references = sorted(
            {
                match.group(0)
                for match in reference_pattern.finditer(source_text)
                if match.group(0).lower() not in candidate_text.lower()
            }
        )
        if missing_references:
            violations.append("reference labels " + ", ".join(missing_references))

        # Protect concrete choices written by the H3 builder into CORE ACTION.
        # Their surrounding prose may be rewritten, but replacing the chosen
        # pose, garment, or expression is never a valid enhancement.
        protected_patterns = (
            ("fixed pose", r"\bUse\s+([^\n.,]{2,100}?)\s+as\s+the\s+one\s+and\s+only\s+fixed"),
            ("fixed pose", r"\buse\s+([^\n.,]{2,100}?\bPose)\b"),
            ("garment", r"\bwearing\s+(?:a|an)\s+([^\n,]{2,100}?),\s+with\b"),
            (
                "garment",
                r"\bdress\s+<Subject\s+\d+>\s+in\s+(?:a|an)\s+([^\n,]{2,100}?)(?:,|\band\s+use\b)",
            ),
            (
                "expression",
                r"\bGive\s+<Subject\s+\d+>\s+(?:a|an)\s+([^\n,.]{1,80}?\bexpression)",
            ),
        )
        candidate_lower = candidate_text.casefold()
        for label, pattern in protected_patterns:
            for match in re.finditer(pattern, source_text, flags=re.IGNORECASE):
                selection = " ".join(match.group(1).split()).strip(" .,:;-")
                if selection and selection.casefold() not in candidate_lower:
                    violations.append(f"selected {label}: {selection}")

        director_pattern = re.compile(
            r"^\s*(SCENE\s+\d+\b|HANDOFF\s+TO\s+NEXT\s+SCENE\b|"
            r"CONTINUE\s+FROM\s+PREVIOUS\s+SCENE\b|FINAL\s+SHOT\b)",
            flags=re.IGNORECASE | re.MULTILINE,
        )
        source_headings = [match.group(1).upper() for match in director_pattern.finditer(source_text)]
        candidate_headings = [match.group(1).upper() for match in director_pattern.finditer(candidate_text)]
        if source_headings != candidate_headings:
            violations.append("Director headings or order")

        return list(dict.fromkeys(violations))

    @staticmethod
    def _restore_h3_tail_sections(source: str, candidate: str) -> tuple[str, List[str]]:
        """Restore omitted builder-owned tail sections without discarding a useful rewrite."""
        source_text = str(source or "").strip()
        candidate_text = str(candidate or "").strip()
        headings = ("SHOT RULES", "SELECTED H3 DIRECTION")
        restored: List[str] = []

        for index, heading in enumerate(headings):
            heading_pattern = re.compile(
                rf"^\s*{re.escape(heading)}\s*:",
                flags=re.IGNORECASE | re.MULTILINE,
            )
            if not heading_pattern.search(source_text) or heading_pattern.search(candidate_text):
                continue

            source_match = heading_pattern.search(source_text)
            assert source_match is not None
            end = len(source_text)
            for later_heading in headings[index + 1 :]:
                later_match = re.search(
                    rf"^\s*{re.escape(later_heading)}\s*:",
                    source_text[source_match.end() :],
                    flags=re.IGNORECASE | re.MULTILINE,
                )
                if later_match:
                    end = source_match.end() + later_match.start()
                    break
            block = source_text[source_match.start() : end].strip()
            if not block:
                continue

            insert_at = len(candidate_text)
            for later_heading in headings[index + 1 :]:
                later_match = re.search(
                    rf"^\s*{re.escape(later_heading)}\s*:",
                    candidate_text,
                    flags=re.IGNORECASE | re.MULTILINE,
                )
                if later_match:
                    insert_at = later_match.start()
                    break
            before = candidate_text[:insert_at].rstrip()
            after = candidate_text[insert_at:].lstrip()
            candidate_text = f"{before}\n\n{block}"
            if after:
                candidate_text += f"\n\n{after}"
            restored.append(heading)

        return candidate_text, restored

    @staticmethod
    def _image_cache_token(image: Any) -> str:
        if image is None:
            return ""
        try:
            value = image
            if torch is not None and isinstance(value, torch.Tensor):
                value = value.detach().to("cpu").contiguous().numpy()
            else:
                value = np.ascontiguousarray(value)
            digest = hashlib.sha256(value.tobytes()).hexdigest()
            return f"{tuple(value.shape)}:{value.dtype}:{digest}"
        except Exception:
            return f"{type(image).__module__}.{type(image).__qualname__}:{id(image)}"

    @staticmethod
    def _clip_cache_token(clip: Any) -> tuple[Any, ...]:
        """Identify the loaded text model, not its short-lived CLIP wrapper clone."""
        model = getattr(clip, "cond_stage_model", None)
        patcher = getattr(clip, "patcher", None)
        patches = getattr(patcher, "patches", None)
        patch_keys = tuple(sorted(str(key) for key in patches)) if isinstance(patches, dict) else ()
        return (
            id(model) if model is not None else id(clip),
            type(model).__module__ if model is not None else type(clip).__module__,
            type(model).__qualname__ if model is not None else type(clip).__qualname__,
            getattr(clip, "layer_idx", None),
            patch_keys,
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
        task_mode="Krea2 / Image",
        h3_length_behavior="Preserve",
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
        task_mode = PROMPT_TASK_MODE_ALIASES.get(
            str(task_mode or "Krea2 / Image"),
            "Krea2 / Image",
        )
        h3_length_behavior = (
            str(h3_length_behavior)
            if str(h3_length_behavior) in H3_LENGTH_BEHAVIORS
            else "Preserve"
        )

        if not enabled or not raw:
            status = "Enhancer bypassed." if not enabled else "No idea supplied."
            return (raw, "", status)

        resolved_mode = self._resolve_task_mode(raw, task_mode)
        instruction = self._instruction(
            raw,
            preset,
            detail_level,
            image is not None,
            custom_instructions,
            resolved_mode,
            h3_length_behavior,
        )
        if not hasattr(clip, "tokenize") or not hasattr(clip, "generate") or not hasattr(clip, "decode"):
            raise RuntimeError(
                "The connected CLIP does not provide text generation. Connect the same "
                "generative Qwen/Krea2 CLIP that works with ComfyUI Generate Text."
            )

        cache_key = (
            self._clip_cache_token(clip),
            raw,
            preset,
            detail_level,
            float(creativity),
            int(max_length),
            int(seed),
            bool(thinking),
            bool(use_default_template),
            _clean_text(custom_instructions),
            task_mode,
            resolved_mode,
            h3_length_behavior,
            self._image_cache_token(image),
        )
        cached = self._fixed_seed_cache.get(cache_key)
        if cached is not None:
            enhanced, cached_status = cached
            self._fixed_seed_cache.move_to_end(cache_key)
            return (
                enhanced or raw,
                instruction,
                f"Reused exact fixed-seed prompt. {cached_status}",
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
        is_h3 = resolved_mode in H3_MODE_LABELS
        generated_length = len(enhanced)
        restored_sections: List[str] = []
        if is_h3:
            enhanced, restored_sections = self._restore_h3_tail_sections(raw, enhanced)
        safety_violations = (
            self._h3_preservation_violations(raw, enhanced, h3_length_behavior)
            if is_h3 else []
        )
        if safety_violations:
            enhanced = raw
        custom_is_active = is_h3 or preset == "Custom"
        custom_state = (
            "custom instructions active"
            if custom_is_active and _clean_text(custom_instructions)
            else (
                "custom instructions ignored"
                if not custom_is_active and _clean_text(custom_instructions)
                else "no custom instructions"
            )
        )
        behavior = (
            f"{resolved_mode} / {h3_length_behavior}"
            if is_h3
            else f"{preset} / {PRESET_DETAIL_OVERRIDES.get(preset, detail_level)}"
        )
        auto_state = f"Auto detected {resolved_mode}; " if task_mode == "Auto" else ""
        restored_state = (
            f"restored protected H3 sections: {', '.join(restored_sections)}; "
            if restored_sections else ""
        )
        if safety_violations:
            status = (
                f"H3 safety fallback preserved the original {len(raw)}-character prompt because "
                f"the {generated_length}-character rewrite changed protected content: "
                f"{'; '.join(safety_violations)}. {restored_state}{auto_state}{custom_state}; seed {seed}."
            )
        else:
            status = (
                f"NovoLoko enhanced {len(raw)} → {len(enhanced)} characters using "
                f"{behavior}; {restored_state}{auto_state}{custom_state}; creativity {creativity:g}; "
                f"max {max_length}; seed {seed}."
            )
        self._fixed_seed_cache[cache_key] = (enhanced or raw, status)
        self._fixed_seed_cache.move_to_end(cache_key)
        while len(self._fixed_seed_cache) > self._fixed_seed_cache_limit:
            self._fixed_seed_cache.popitem(last=False)
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
    package_root = os.path.dirname(os.path.realpath(__file__))
    directory = os.path.realpath(
        os.path.join(package_root, "data", "NovoLokoTimerSounds")
    )
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
    "NovaControlPanelSwitch": NovaControlPanelSwitch,
    "NovaGenerationTimer": NovaGenerationTimer,
    "NovaPreviewPassThrough": NovaPreviewPassThrough,
    "NovaMemoryManager": NovaMemoryManager,
    "NovaPromptEnhancer": NovaPromptEnhancer,
    "NovaTextDisplay": NovaTextDisplay,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NovaDynamicTextConcatenate": "NovoLoko Text Concatenate — Auto Expand",
    "NovaSeedLab": "NovoLoko Seed Lab — Random / Fixed / History",
    "NovaControlPanelSwitch": "NovoLoko Control Panel",
    "NovaGenerationTimer": "NovoLoko Generation Timer",
    "NovaPreviewPassThrough": "NovoLoko Preview — Pass Through / Optional Save",
    "NovaMemoryManager": "NovoLoko Memory Manager — RAM + VRAM",
    "NovaPromptEnhancer": "NovoLoko Prompt Enhancer Pro",
    "NovaTextDisplay": "NovoLoko Text Display",
}
