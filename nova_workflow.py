"""NovoLoko workflow-dependency replacements and metadata-preserving image save."""

from __future__ import annotations

import os
import random
import time
from typing import Any, Dict, List

import numpy as np
from PIL import Image

try:
    import folder_paths
except Exception:
    folder_paths = None

from .nodes import _node_dir, _read_styles, _resolve_csv_path
from .nova_metadata import (
    build_metadata_fields,
    build_pnginfo,
    expand_filename_tokens,
    extract_generation_info,
    write_recipe,
)


def _style_files() -> List[str]:
    root = os.path.join(_node_dir(), "styles")
    files = []
    if os.path.isdir(root):
        for dirpath, _, filenames in os.walk(root):
            for filename in filenames:
                if filename.lower().endswith((".yaml", ".yml")):
                    full = os.path.join(dirpath, filename)
                    files.append(os.path.relpath(full, _node_dir()).replace("\\", "/"))
    files.sort(key=lambda value: (0 if value.endswith("camera.yaml") else 1, value.lower()))
    return files or ["styles/camera.yaml"]


def _template_names(style_file: str) -> List[str]:
    try:
        records = _read_styles(style_file)
        names = [str(record.get("name") or "").strip() for record in records]
        names = [name for name in names if name]
    except Exception:
        names = []
    ordered = []
    for rescue in ("none", "random"):
        if rescue not in {name.lower() for name in names}:
            ordered.append(rescue)
    ordered.extend(names)
    seen = set()
    unique = []
    for name in ordered:
        key = name.lower()
        if key not in seen:
            unique.append(name)
            seen.add(key)
    return unique or ["none", "random"]


class NovaPromptStyler:
    """Native replacement for the iTools/manual YAML prompt styler."""

    @classmethod
    def INPUT_TYPES(cls):
        files = _style_files()
        default_file = "styles/camera.yaml" if "styles/camera.yaml" in files else files[0]
        return {
            "required": {
                "text_positive": ("STRING", {"default": "", "multiline": True}),
                "text_negative": ("STRING", {"default": "", "multiline": True}),
                "style_file": (files, {"default": default_file}),
                "template_name": (_template_names(default_file), {"default": "none"}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("positive_prompt", "negative_prompt", "used_template")
    FUNCTION = "style"
    CATEGORY = "NovoLoko/Prompt"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def IS_CHANGED(
        cls,
        text_positive="",
        text_negative="",
        style_file="styles/camera.yaml",
        template_name="none",
    ):
        if str(template_name or "none").strip().lower() == "random":
            return time.time_ns()
        try:
            modified = os.path.getmtime(_resolve_csv_path(style_file))
        except OSError:
            modified = 0
        return (text_positive, text_negative, style_file, template_name, modified)

    def style(self, text_positive="", text_negative="", style_file="styles/camera.yaml", template_name="none"):
        positive = str(text_positive or "").strip()
        negative = str(text_negative or "").strip()
        requested = str(template_name or "none").strip()

        try:
            records = _read_styles(style_file)
        except Exception:
            records = []

        usable = [
            record for record in records
            if str(record.get("name") or "").strip().lower() not in {"none", "random"}
        ]
        if requested.lower() == "random":
            record = random.SystemRandom().choice(usable) if usable else None
        else:
            record = next(
                (
                    item for item in records
                    if str(item.get("name") or "").strip().lower() == requested.lower()
                ),
                None,
            )

        if not record or requested.lower() == "none":
            return (positive, negative, "none")

        template = str(record.get("prompt") or "").strip()
        style_negative = str(record.get("negative") or "").strip()
        used = str(record.get("name") or requested).strip()

        if template:
            if "{prompt}" in template:
                styled_positive = template.replace("{prompt}", positive).strip(" ,")
            elif positive:
                styled_positive = f"{template}, {positive}".strip(" ,")
            else:
                styled_positive = template
        else:
            styled_positive = positive

        negatives = []
        for value in (negative, style_negative):
            clean = str(value or "").strip()
            if clean and clean.lower() not in {item.lower() for item in negatives}:
                negatives.append(clean)
        return (styled_positive, ", ".join(negatives), used)



class NovaPromptStackSwitch:
    """Separate top-level master switch for the six Prompt Stack slots."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "enabled": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "label_on": "ALL SLOTS ON",
                        "label_off": "ALL SLOTS OFF",
                    },
                ),
            }
        }

    RETURN_TYPES = ("BOOLEAN", "STRING")
    RETURN_NAMES = ("all_slots_enabled", "status")
    FUNCTION = "switch"
    CATEGORY = "NovoLoko/Prompt"

    def switch(self, enabled=True):
        value = bool(enabled)
        return (value, "ALL SLOTS ON" if value else "ALL SLOTS OFF — selections preserved")


class NovaSaveImageMetadata:
    """Metadata-first NovoLoko replacement for Save Image (LoraManager)."""

    DESCRIPTION = (
        "Prompt and workflow metadata are captured automatically through ComfyUI's "
        "hidden PROMPT and EXTRA_PNGINFO channels. Visible prompt cables are not required. "
        "PNG embeds the full API prompt and editable workflow; JPG/WebP use recipe sidecars "
        "when metadata is requested."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "filename_prefix": (
                    "STRING",
                    {"default": "NovoLoko/%seed%_%model%", "multiline": False},
                ),
                "file_format": (["png", "webp", "jpg"], {"default": "png"}),
                "lossless_webp": ("BOOLEAN", {"default": False}),
                "quality": ("INT", {"default": 100, "min": 1, "max": 100}),
                "embed_workflow": ("BOOLEAN", {"default": True}),
                "save_with_metadata": ("BOOLEAN", {"default": True}),
                "add_counter_to_filename": ("BOOLEAN", {"default": True}),
                "save_as_recipe": ("BOOLEAN", {"default": False}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("IMAGE", "STRING", "STRING")
    RETURN_NAMES = ("images", "saved_files", "status")
    FUNCTION = "save"
    CATEGORY = "NovoLoko/Image"
    OUTPUT_NODE = True

    @staticmethod
    def _pil_images(images) -> List[Image.Image]:
        tensor = images.detach().cpu().numpy() if hasattr(images, "detach") else np.asarray(images)
        if tensor.ndim == 3:
            tensor = tensor[None, ...]
        output = []
        for array in tensor:
            array = np.nan_to_num(array, nan=0.0, posinf=1.0, neginf=0.0)
            if array.dtype != np.uint8:
                array = np.clip(array, 0.0, 1.0)
                array = (array * 255.0 + 0.5).astype(np.uint8)
            if array.shape[-1] == 1:
                array = array[:, :, 0]
            output.append(Image.fromarray(array))
        return output

    def save(
        self,
        images,
        filename_prefix="NovoLoko/%seed%_%model%",
        file_format="png",
        lossless_webp=False,
        quality=100,
        embed_workflow=True,
        save_with_metadata=True,
        add_counter_to_filename=True,
        save_as_recipe=False,
        prompt=None,
        extra_pnginfo=None,
        unique_id=None,
        **legacy_metadata,
    ):
        if folder_paths is None:
            raise RuntimeError("NovoLoko Save Image requires ComfyUI folder_paths.")

        pil_images = self._pil_images(images)
        if not pil_images:
            raise ValueError("NovoLoko Save Image received no images.")

        generation = extract_generation_info(prompt, unique_id)
        expanded_prefix = expand_filename_tokens(filename_prefix, generation, "")
        output_dir = folder_paths.get_output_directory()

        full_output_folder, filename, counter, subfolder, _ = folder_paths.get_save_image_path(
            expanded_prefix,
            output_dir,
            pil_images[0].width,
            pil_images[0].height,
        )
        os.makedirs(full_output_folder, exist_ok=True)

        base_fields = build_metadata_fields(
            prompt=prompt,
            extra_pnginfo=extra_pnginfo,
            unique_id=unique_id,
            positive_prompt=legacy_metadata.get("positive_prompt", ""),
            negative_prompt=legacy_metadata.get("negative_prompt", ""),
            prompt_source=legacy_metadata.get("prompt_source", ""),
            prompt_stack_summary=legacy_metadata.get("prompt_stack_summary", ""),
            include_prompt=bool(save_with_metadata),
            include_workflow=bool(embed_workflow),
            additional={
                "nova_save_node": "NovaSaveImageMetadata",
                "nova_filename_prefix": expanded_prefix,
                "nova_metadata_capture": "automatic hidden PROMPT + EXTRA_PNGINFO",
            },
        ) if (save_with_metadata or embed_workflow) else {}

        fmt = str(file_format or "png").lower()
        extension = "jpg" if fmt in {"jpg", "jpeg"} else fmt
        ui_images = []
        saved_paths = []

        for batch_index, image in enumerate(pil_images):
            name_base = filename.replace("%batch_num%", str(batch_index))
            if len(pil_images) > 1 and "%batch_num%" not in filename:
                name_base = f"{name_base}_{batch_index:02d}"

            if add_counter_to_filename:
                file_name = f"{name_base}_{counter:05}_.{extension}"
                counter += 1
            else:
                file_name = f"{name_base}.{extension}"
                candidate = os.path.join(full_output_folder, file_name)
                duplicate = 1
                while os.path.exists(candidate):
                    file_name = f"{name_base}_{duplicate:03d}.{extension}"
                    candidate = os.path.join(full_output_folder, file_name)
                    duplicate += 1

            path = os.path.join(full_output_folder, file_name)
            fields = dict(base_fields)
            fields.update({
                "nova_batch_index": str(batch_index),
                "nova_width": str(image.width),
                "nova_height": str(image.height),
                "nova_file_format": extension,
            })

            if extension == "png":
                image.save(
                    path,
                    format="PNG",
                    pnginfo=build_pnginfo(fields),
                    compress_level=2,
                )
            elif extension == "webp":
                # WebP metadata support varies between Pillow/browser versions.
                # A recipe sidecar is always written when metadata is requested.
                image.save(
                    path,
                    format="WEBP",
                    quality=int(quality),
                    lossless=bool(lossless_webp),
                    method=4,
                )
                if fields:
                    write_recipe(path, fields)
            else:
                rgb = image.convert("RGB")
                rgb.save(path, format="JPEG", quality=int(quality), optimize=True)
                if fields:
                    write_recipe(path, fields)

            if save_as_recipe and fields:
                write_recipe(path, fields)

            saved_paths.append(path)
            ui_images.append({
                "filename": file_name,
                "subfolder": subfolder,
                "type": "output",
            })

        status = f"Saved {len(saved_paths)} image(s) with automatic prompt/workflow metadata."
        return {
            "ui": {
                "images": ui_images,
                "nova_saved_files": saved_paths,
                "nova_save_status": [status],
            },
            "result": (images, "\n".join(saved_paths), status),
        }


NODE_CLASS_MAPPINGS = {
    "NovaPromptStyler": NovaPromptStyler,
    "NovaPromptStackSwitch": NovaPromptStackSwitch,
    "NovaSaveImageMetadata": NovaSaveImageMetadata,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NovaPromptStyler": "NovoLoko Manual Prompt + YAML Styler",
    "NovaPromptStackSwitch": "NovoLoko Prompt Stack — All Slots Switch",
    "NovaSaveImageMetadata": "NovoLoko Save Image — Prompt + Workflow Metadata",
}


# Dynamic style-template dropdown for NovaPromptStyler.
try:
    from aiohttp import web
    from server import PromptServer

    @PromptServer.instance.routes.get("/nova_prompt_styler/list")
    async def nova_prompt_styler_list(request):
        style_file = request.query.get("file", "styles/camera.yaml")
        try:
            resolved = _resolve_csv_path(style_file)
            names = _template_names(style_file)
            return web.json_response({
                "ok": True,
                "file": style_file,
                "resolved_path": resolved,
                "templates": names,
            })
        except Exception as error:
            return web.json_response({"ok": False, "error": str(error)}, status=400)
except Exception:
    pass
