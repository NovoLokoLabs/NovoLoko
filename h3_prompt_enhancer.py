"""Easy-to-use MiniMax H3 prompt assembly for NovoLoko.

The bundled CSV text is deliberately kept as complete prompt sentences.  The
node adds structure around those sentences but never rewrites their contents.
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path
from typing import Dict, List, Mapping, Optional, Tuple


H3_DATA_DIR = Path(__file__).resolve().parent / "csv" / "h3"
NONE_CHOICE = "None / Keep prompt unchanged"
MODES = [
    "Auto",
    "Standard H3",
    "Director 4 Scenes",
    "Full Reference / Video Edit",
]
FIELDS: Tuple[Tuple[str, str], ...] = (
    ("pose", "Pose"),
    ("clothing", "Clothing"),
    ("hair", "Hair"),
    ("expression", "Expression"),
    ("camera", "Camera"),
    ("environment", "Environment"),
    ("lighting", "Lighting"),
    ("stability", "Stability"),
    ("audio", "Audio / Music"),
)


def _read_library(key: str) -> Tuple[List[str], Dict[str, str]]:
    """Return stable dropdown names and their complete H3 prompt sentences."""
    names = [NONE_CHOICE]
    prompts: Dict[str, str] = {NONE_CHOICE: ""}
    path = H3_DATA_DIR / f"{key}.csv"
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                name = str(row.get("name", "")).strip()
                prompt = str(row.get("prompt", "")).strip()
                if not name or not prompt or name in prompts:
                    continue
                names.append(name)
                prompts[name] = prompt
    except (OSError, UnicodeError, csv.Error) as exc:
        print(f"[NovoLoko H3] Could not read {path.name}: {exc}")
    return names, prompts


def _detect_mode(raw_prompt: str) -> str:
    text = str(raw_prompt or "").lower()
    if re.search(r"\b(scene\s*[1-4]|director\s*(mode|4)|four[- ]scene)\b", text):
        return "Director 4 Scenes"
    if re.search(
        r"\b(video\s*[1-9]|reference\s+video|video\s+edit|motion\s+transfer|ref2v|ref2va|full\s+reference)\b",
        text,
    ):
        return "Full Reference / Video Edit"
    return "Standard H3"


def _director_scenes(raw_prompt: str) -> List[str]:
    raw = str(raw_prompt or "").strip()
    if not raw:
        raw = "Build one continuous cinematic action while preserving the selected direction."
    explicit = re.split(r"(?i)(?=\bscene\s*[1-4]\s*[:\-])", raw)
    explicit = [part.strip() for part in explicit if part.strip()]
    if len(explicit) >= 2:
        return explicit[:4]
    parts = [part.strip() for part in re.split(r"\s*(?:\||;|\n)\s*", raw) if part.strip()]
    if len(parts) >= 2:
        return parts[:4]
    return [
        f"Establish the subject and setting: {raw}",
        "Continue the same action with a clear visual progression and no identity change.",
        "Develop the movement naturally while preserving subject, wardrobe, lighting, and screen direction.",
        "Resolve the action in a clean final composition that follows seamlessly from the previous scene.",
    ]


def _compose_prompt(mode: str, raw_prompt: str, snippets: List[str]) -> str:
    raw = str(raw_prompt or "").strip()
    direction = "\n".join(f"- {sentence}" for sentence in snippets)
    if mode == "Director 4 Scenes":
        scenes = _director_scenes(raw)
        scene_lines = []
        for index in range(4):
            content = scenes[index] if index < len(scenes) else (
                "Continue the previous scene naturally without a cut in identity, wardrobe, or environment."
            )
            if re.match(r"(?i)^scene\s*[1-4]\s*[:\-]", content):
                scene_lines.append(content)
            else:
                scene_lines.append(f"Scene {index + 1}: {content}")
        sections = [
            "H3 DIRECTOR — 4 SCENES",
            *scene_lines,
            "GLOBAL CONTINUITY: Treat all four scenes as one continuous shot sequence. Preserve identity, anatomy, wardrobe, environment, and motion direction across every transition.",
        ]
    elif mode == "Full Reference / Video Edit":
        sections = [
            "H3 FULL REFERENCE / VIDEO EDIT",
            f"CORE EDIT DIRECTION: {raw or 'Follow the supplied references while preserving a coherent subject and scene.'}",
            "REFERENCE RULES: Use named Picture, Video, and Audio references exactly as described in the core direction. Preserve source identity and intended motion unless the prompt explicitly requests a change.",
        ]
    else:
        sections = [
            "H3 STANDARD PROMPT",
            f"CORE ACTION: {raw or 'Create a coherent cinematic shot using the selected direction.'}",
            "SHOT RULES: Keep the action readable, temporally continuous, and visually consistent from the first frame to the last.",
        ]
    if direction:
        sections.extend(["SELECTED H3 DIRECTION:", direction])
    return "\n\n".join(sections).strip()


class NovaH3PromptEnhancer:
    """Standalone H3 prompt node with built-in curated dropdown libraries."""

    @classmethod
    def INPUT_TYPES(cls):
        required = {
            "mode": (MODES, {"default": "Auto"}),
            "raw_prompt": (
                "STRING",
                {
                    "default": "Describe the subject, action, references, and the shot you want.",
                    "multiline": True,
                    "dynamicPrompts": True,
                },
            ),
        }
        for key, _label in FIELDS:
            choices, _prompts = _read_library(key)
            required[key] = (choices, {"default": choices[0]})
        optional = {
            f"{key}_override": (
                "STRING",
                {
                    "forceInput": True,
                    "tooltip": f"Optional advanced {label.lower()} text. A connected non-empty value overrides the dropdown.",
                },
            )
            for key, label in FIELDS
        }
        return {"required": required, "optional": optional}

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("final_prompt", "selected_options", "detected_mode")
    FUNCTION = "enhance"
    CATEGORY = "NovoLoko/H3"
    DESCRIPTION = (
        "Turns a rough idea into a structured H3 prompt. Pick built-in options for normal use; "
        "connect any optional override socket only for advanced or batch workflows."
    )

    def enhance(self, mode="Auto", raw_prompt="", **kwargs):
        requested_mode = str(mode or "Auto")
        detected_mode = _detect_mode(raw_prompt) if requested_mode == "Auto" else requested_mode
        if detected_mode not in MODES[1:]:
            detected_mode = "Standard H3"

        snippets: List[str] = []
        selections: Dict[str, Mapping[str, str]] = {}
        concise: List[str] = []
        for key, label in FIELDS:
            selected_name = str(kwargs.get(key, NONE_CHOICE) or NONE_CHOICE)
            override = str(kwargs.get(f"{key}_override") or "").strip()
            _names, prompts = _read_library(key)
            if override:
                sentence = override
                display_name = "Advanced override"
                source = "override"
            else:
                sentence = prompts.get(selected_name, "")
                display_name = selected_name if sentence else "None"
                source = "dropdown" if sentence else "none"
            if sentence:
                snippets.append(sentence)
                concise.append(f"{label}: {display_name}")
            selections[key] = {
                "name": display_name,
                "source": source,
                "prompt": sentence,
            }

        final_prompt = _compose_prompt(detected_mode, raw_prompt, snippets)
        selected_options = json.dumps(
            {
                "requested_mode": requested_mode,
                "detected_mode": detected_mode,
                "selections": selections,
            },
            ensure_ascii=False,
            indent=2,
        )
        summary = f"{detected_mode} | " + (" • ".join(concise) if concise else "No optional directions")
        return {
            "ui": {"h3_selection_summary": [summary]},
            "result": (final_prompt, selected_options, detected_mode),
        }


NODE_CLASS_MAPPINGS = {"NovaH3PromptEnhancer": NovaH3PromptEnhancer}
NODE_DISPLAY_NAME_MAPPINGS = {"NovaH3PromptEnhancer": "NovoLoko H3 Prompt Enhancer"}


__all__ = [
    "NovaH3PromptEnhancer",
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
]
