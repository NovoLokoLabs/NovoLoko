"""Shared metadata helpers for NovoLoko PNG history, compare, and save nodes."""

from __future__ import annotations

import json
import os
import re
from datetime import datetime
from typing import Any, Dict, Iterable, Optional

from PIL.PngImagePlugin import PngInfo


NOVA_METADATA_VERSION = "2.9.13"


def json_text(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)
    except Exception:
        return json.dumps(str(value), ensure_ascii=False)


def clean_text(value: Any, limit: int = 500000) -> str:
    return str(value or "").strip()[:limit]


def _linked_node_id(value: Any) -> Optional[str]:
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        node_id = value[0]
        if isinstance(node_id, (str, int)):
            return str(node_id)
    return None


def _prompt_node(prompt: Dict[str, Any], node_id: Any) -> Dict[str, Any]:
    return prompt.get(str(node_id), {}) if isinstance(prompt, dict) else {}


def upstream_nodes(prompt: Any, unique_id: Any = None) -> Iterable[Dict[str, Any]]:
    """Breadth-first walk from the current output node toward generation nodes."""
    if not isinstance(prompt, dict):
        return []

    start = str(unique_id) if unique_id is not None else ""
    queue = [start] if start and start in prompt else list(prompt.keys())
    visited = set()
    ordered = []

    while queue:
        node_id = str(queue.pop(0))
        if node_id in visited:
            continue
        visited.add(node_id)
        node = _prompt_node(prompt, node_id)
        if not isinstance(node, dict):
            continue
        ordered.append({"id": node_id, **node})
        inputs = node.get("inputs") or {}
        if isinstance(inputs, dict):
            for value in inputs.values():
                linked = _linked_node_id(value)
                if linked and linked not in visited and linked in prompt:
                    queue.append(linked)
    return ordered


def extract_generation_info(prompt: Any, unique_id: Any = None) -> Dict[str, Any]:
    info: Dict[str, Any] = {
        "seed": "",
        "steps": "",
        "cfg": "",
        "sampler": "",
        "scheduler": "",
        "denoise": "",
        "model": "",
        "vae": "",
        "clip": "",
    }

    nodes = list(upstream_nodes(prompt, unique_id))
    if not nodes and isinstance(prompt, dict):
        nodes = [{"id": str(k), **v} for k, v in prompt.items() if isinstance(v, dict)]

    sampler_classes = {
        "KSampler", "KSamplerAdvanced", "SamplerCustom", "SamplerCustomAdvanced",
    }
    model_keys = ("unet_name", "ckpt_name", "model_name", "checkpoint")
    vae_keys = ("vae_name",)
    clip_keys = ("clip_name",)

    for node in nodes:
        class_type = str(node.get("class_type") or node.get("type") or "")
        inputs = node.get("inputs") or {}
        if not isinstance(inputs, dict):
            continue

        if class_type in sampler_classes or "KSampler" in class_type:
            for key, target in (
                ("seed", "seed"),
                ("noise_seed", "seed"),
                ("steps", "steps"),
                ("cfg", "cfg"),
                ("sampler_name", "sampler"),
                ("scheduler", "scheduler"),
                ("denoise", "denoise"),
            ):
                value = inputs.get(key)
                if target == "seed" and _linked_node_id(value):
                    continue
                if value is not None and value != "" and info[target] == "":
                    info[target] = value

        for key in model_keys:
            value = inputs.get(key)
            if value not in (None, "") and not _linked_node_id(value) and not info["model"]:
                info["model"] = value
        for key in vae_keys:
            value = inputs.get(key)
            if value not in (None, "") and not _linked_node_id(value) and not info["vae"]:
                info["vae"] = value
        for key in clip_keys:
            value = inputs.get(key)
            if value not in (None, "") and not _linked_node_id(value) and not info["clip"]:
                info["clip"] = value

        # Linked seed providers frequently expose a literal seed input.
        if not info["seed"]:
            for key in ("seed", "value", "noise_seed"):
                value = inputs.get(key)
                if isinstance(value, int):
                    info["seed"] = value
                    break
                if isinstance(value, str) and value.strip().isdigit():
                    info["seed"] = value.strip()
                    break

    return info


def _parameters_text(
    positive_prompt: str,
    negative_prompt: str,
    info: Dict[str, Any],
) -> str:
    lines = [clean_text(positive_prompt)]
    if negative_prompt:
        lines.append(f"Negative prompt: {clean_text(negative_prompt)}")

    labels = [
        ("Steps", info.get("steps")),
        ("Sampler", info.get("sampler")),
        ("Schedule type", info.get("scheduler")),
        ("CFG scale", info.get("cfg")),
        ("Seed", info.get("seed")),
        ("Model", info.get("model")),
        ("Denoising strength", info.get("denoise")),
    ]
    values = [f"{label}: {value}" for label, value in labels if value not in ("", None)]
    if values:
        lines.append(", ".join(values))
    return "\n".join(part for part in lines if part)


def build_metadata_fields(
    *,
    prompt: Any = None,
    extra_pnginfo: Any = None,
    unique_id: Any = None,
    positive_prompt: Any = "",
    negative_prompt: Any = "",
    prompt_source: Any = "",
    prompt_stack_summary: Any = "",
    manual_prompt: Any = "",
    enhanced_prompt: Any = "",
    include_prompt: bool = True,
    include_workflow: bool = True,
    additional: Optional[Dict[str, Any]] = None,
) -> Dict[str, str]:
    fields: Dict[str, str] = {
        "nova_metadata_version": NOVA_METADATA_VERSION,
        "nova_created": datetime.now().isoformat(timespec="seconds"),
    }

    if include_prompt and prompt is not None:
        fields["prompt"] = json_text(prompt)

    if isinstance(extra_pnginfo, dict):
        for key, value in extra_pnginfo.items():
            if str(key) == "workflow" and not include_workflow:
                continue
            if include_workflow or str(key) != "workflow":
                fields[str(key)] = json_text(value)

    positive = clean_text(positive_prompt)
    negative = clean_text(negative_prompt)
    source = clean_text(prompt_source, 2000)
    stack = clean_text(prompt_stack_summary)
    manual = clean_text(manual_prompt)
    enhanced = clean_text(enhanced_prompt)

    explicit = {
        "positive_prompt": positive,
        "negative_prompt": negative,
        "nova_prompt_source": source,
        "nova_prompt_stack": stack,
        "nova_manual_prompt": manual,
        "nova_enhanced_prompt": enhanced,
    }
    fields.update({key: value for key, value in explicit.items() if value})

    generation = extract_generation_info(prompt, unique_id)
    fields["nova_generation"] = json_text(generation)
    parameters = _parameters_text(positive, negative, generation)
    if parameters:
        fields["parameters"] = parameters

    if additional:
        for key, value in additional.items():
            if value in (None, ""):
                continue
            fields[str(key)] = value if isinstance(value, str) else json_text(value)

    return fields


def build_pnginfo(fields: Optional[Dict[str, Any]]) -> Optional[PngInfo]:
    if not fields:
        return None
    info = PngInfo()
    for key, value in fields.items():
        try:
            info.add_text(str(key), value if isinstance(value, str) else json_text(value))
        except Exception:
            continue
    return info


def sanitise_token(value: Any, fallback: str = "unknown") -> str:
    text = os.path.basename(str(value or "")).strip()
    text = os.path.splitext(text)[0]
    text = re.sub(r"[^A-Za-z0-9._-]+", "_", text).strip("._-")
    return text[:120] or fallback


def expand_filename_tokens(
    prefix: str,
    generation: Dict[str, Any],
    prompt_source: str = "",
) -> str:
    now = datetime.now()
    replacements = {
        "%seed%": sanitise_token(generation.get("seed"), "seed"),
        "%model%": sanitise_token(generation.get("model"), "model"),
        "%sampler%": sanitise_token(generation.get("sampler"), "sampler"),
        "%scheduler%": sanitise_token(generation.get("scheduler"), "scheduler"),
        "%date%": now.strftime("%Y-%m-%d"),
        "%time%": now.strftime("%H-%M-%S"),
        "%prompt_source%": sanitise_token(prompt_source, "source"),
    }
    output = str(prefix or "NovoLoko/%seed%_%model%")
    for token, value in replacements.items():
        output = output.replace(token, value)
    output = output.replace("\\", "/")
    parts = [sanitise_token(part, "Nova") for part in output.split("/") if part.strip()]
    return "/".join(parts) or "NovoLoko/NovoLokoImage"


def write_recipe(path: str, fields: Dict[str, Any]) -> str:
    recipe_path = os.path.splitext(path)[0] + ".recipe.json"
    with open(recipe_path, "w", encoding="utf-8") as handle:
        json.dump(fields, handle, ensure_ascii=False, indent=2)
    return recipe_path
