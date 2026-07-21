import asyncio
import os
import random
import re
import subprocess
import sys
from datetime import datetime
from typing import List

import numpy as np
from PIL import Image

from .nova_metadata import build_metadata_fields, build_pnginfo

try:
    import folder_paths
except Exception:
    folder_paths = None


COMPARE_SUBFOLDER = "NovoLokoCompare"


def _compare_output_dir() -> str:
    base = folder_paths.get_output_directory() if folder_paths else os.getcwd()
    path = os.path.realpath(os.path.join(base, COMPARE_SUBFOLDER))
    os.makedirs(path, exist_ok=True)
    return path


def _safe_prefix(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", str(value or "NovoLokoCompare")).strip("._-")
    return value[:80] or "NovoLokoCompare"


def _next_output_path(prefix: str) -> str:
    directory = _compare_output_dir()
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base = f"{_safe_prefix(prefix)}_{stamp}"
    candidate = os.path.join(directory, f"{base}.png")
    counter = 1
    while os.path.exists(candidate):
        candidate = os.path.join(directory, f"{base}_{counter:03d}.png")
        counter += 1
    return candidate


def _open_path(path: str, reveal: bool = False) -> str:
    real_path = os.path.realpath(path)
    if not os.path.exists(real_path):
        raise FileNotFoundError(real_path)

    if sys.platform.startswith("win"):
        if reveal and os.path.isfile(real_path):
            subprocess.Popen(["explorer", "/select,", os.path.normpath(real_path)])
        else:
            os.startfile(real_path if os.path.isdir(real_path) else os.path.dirname(real_path))  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        subprocess.Popen(["open", "-R" if reveal and os.path.isfile(real_path) else "", real_path] if reveal and os.path.isfile(real_path) else ["open", real_path])
    else:
        subprocess.Popen(["xdg-open", real_path if os.path.isdir(real_path) else os.path.dirname(real_path)])
    return real_path


class NovaImageComparePro:
    """NovoLoko two-image comparison node with resizable preview and full-screen viewer."""

    DESCRIPTION = (
        "Native-resolution image viewer and two-image comparison studio. "
        "image_b is optional: connect only image_a for a full-screen single-image viewer, "
        "or connect both images for split, Native/Precision side-by-side, overlay and blink."
    )

    def __init__(self):
        self.output_dir = folder_paths.get_temp_directory() if folder_paths else os.getcwd()
        self.type = "temp"
        self.prefix_append = "_nova_compare_" + "".join(
            random.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(6)
        )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image_a": ("IMAGE", {
                    "tooltip": "Main image. Connect this alone to use NovoLoko as a native-resolution single-image viewer."
                }),
            },
            "optional": {
                "image_b": ("IMAGE", {
                    "tooltip": "Optional comparison image. Leave empty for single-image viewing."
                }),
                "label_a": ("STRING", {"default": "IMAGE A", "multiline": False}),
                "label_b": ("STRING", {"default": "IMAGE B", "multiline": False}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("IMAGE", "IMAGE")
    RETURN_NAMES = ("image_a", "image_b")
    FUNCTION = "compare"
    OUTPUT_NODE = True
    CATEGORY = "NovoLoko/Image"

    @staticmethod
    def _first_image(tensor) -> Image.Image:
        array = tensor[0].detach().cpu().numpy()
        array = np.clip(array * 255.0, 0, 255).astype(np.uint8)
        return Image.fromarray(array).convert("RGB")

    @staticmethod
    def _difference_image(a: Image.Image, b: Image.Image) -> Image.Image:
        bb = b if b.size == a.size else b.resize(a.size, Image.Resampling.LANCZOS)
        aa_arr = np.asarray(a, dtype=np.int16)
        bb_arr = np.asarray(bb, dtype=np.int16)
        diff = np.abs(aa_arr - bb_arr).clip(0, 255).astype(np.uint8)
        return Image.fromarray(diff, mode="RGB")

    def _save_images(self, images: List[Image.Image], metadata_fields=None):
        if folder_paths:
            full_output_folder, filename, counter, subfolder, _ = folder_paths.get_save_image_path(
                "nova_compare" + self.prefix_append,
                self.output_dir,
                images[0].width,
                images[0].height,
            )
        else:
            full_output_folder = self.output_dir
            filename = "nova_compare"
            counter = random.randint(0, 99999)
            subfolder = ""

        os.makedirs(full_output_folder, exist_ok=True)
        results = []
        for image in images:
            file_name = f"{filename}_{counter:05}_.png"
            image.save(os.path.join(full_output_folder, file_name), pnginfo=build_pnginfo(metadata_fields), compress_level=4)
            results.append({"filename": file_name, "subfolder": subfolder, "type": self.type})
            counter += 1
        return results

    def compare(
        self,
        image_a,
        image_b=None,
        label_a="IMAGE A",
        label_b="IMAGE B",
        prompt=None,
        extra_pnginfo=None,
        unique_id=None,
        **legacy_metadata,
    ):
        a = self._first_image(image_a)
        has_b = image_b is not None

        if has_b:
            original_b = self._first_image(image_b)
            aligned_b = (
                original_b
                if original_b.size == a.size
                else original_b.resize(a.size, Image.Resampling.LANCZOS)
            )
            diff = self._difference_image(a, aligned_b)
            # Keep B at the exact generated resolution. It is scaled only at
            # presentation time; the old aligned preview silently discarded
            # high-resolution Pass 2 pixels whenever A and B differed.
            preview_images = [a, original_b, diff]
            result_b = image_b
            b_width, b_height = original_b.size
        else:
            # Keep the second IMAGE output type-safe for downstream workflows,
            # while the UI is explicitly told this is single-image mode.
            aligned_b = a
            preview_images = [a]
            result_b = image_a
            b_width, b_height = 0, 0

        metadata_fields = build_metadata_fields(
            prompt=prompt,
            extra_pnginfo=extra_pnginfo,
            unique_id=unique_id,
            positive_prompt=legacy_metadata.get("positive_prompt", ""),
            negative_prompt=legacy_metadata.get("negative_prompt", ""),
            prompt_source=legacy_metadata.get("prompt_source", ""),
            prompt_stack_summary=legacy_metadata.get("prompt_stack_summary", ""),
            include_prompt=True,
            include_workflow=True,
            additional={
                "nova_compare_label_a": str(label_a or "IMAGE A"),
                "nova_compare_label_b": str(label_b or "IMAGE B") if has_b else "",
            },
        )

        info = {
            "has_b": bool(has_b),
            "viewer_mode": "compare" if has_b else "single",
            "a_width": a.width,
            "a_height": a.height,
            "b_width": b_width,
            "b_height": b_height,
            "aligned_width": aligned_b.width,
            "aligned_height": aligned_b.height,
            "a_saved_width": a.width,
            "a_saved_height": a.height,
            "b_saved_width": original_b.width if has_b else 0,
            "b_saved_height": original_b.height if has_b else 0,
            "label_a": str(label_a or "IMAGE A")[:200],
            "label_b": str(label_b or "IMAGE B")[:200] if has_b else "",
            "png_metadata": metadata_fields,
        }
        return {
            "ui": {
                "nova_compare_images": self._save_images(preview_images, metadata_fields),
                "nova_compare": [info],
            },
            "result": (image_a, result_b),
        }


NODE_CLASS_MAPPINGS = {
    "NovaImageComparePro": NovaImageComparePro,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NovaImageComparePro": "NovoLoko Image / Compare Studio",
}


def _compare_source_path(filename: str, subfolder: str = "", kind: str = "temp") -> str:
    name = os.path.basename(str(filename or ""))
    folder = str(subfolder or "").replace("\\", "/").strip("/")
    kind = str(kind or "temp").lower()
    if not name or not name.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
        raise ValueError("Invalid compare image filename.")
    if folder.startswith("..") or "/../" in f"/{folder}/":
        raise ValueError("Invalid compare image subfolder.")
    if folder_paths:
        if kind == "output":
            base = folder_paths.get_output_directory()
        elif kind == "input":
            base = folder_paths.get_input_directory()
        else:
            base = folder_paths.get_temp_directory()
    else:
        base = os.getcwd()
    base = os.path.realpath(base)
    path = os.path.realpath(os.path.join(base, folder, name))
    if os.path.commonpath([base, path]) != base or not os.path.isfile(path):
        raise FileNotFoundError(path)
    return path


try:
    from aiohttp import web
    from server import PromptServer

    @PromptServer.instance.routes.get("/nova_compare/raw")
    async def nova_compare_raw(request):
        try:
            path = _compare_source_path(
                request.query.get("filename", ""),
                request.query.get("subfolder", ""),
                request.query.get("type", "temp"),
            )
            response = web.FileResponse(path)
            response.headers["Cache-Control"] = "no-store"
            response.headers["X-Nova-Native-Resolution"] = "1"
            return response
        except Exception as exc:
            return web.json_response({"ok": False, "error": str(exc)}, status=404)

    @PromptServer.instance.routes.get("/nova_compare/info")
    async def nova_compare_info(request):
        try:
            path = _compare_source_path(
                request.query.get("filename", ""),
                request.query.get("subfolder", ""),
                request.query.get("type", "temp"),
            )
            with Image.open(path) as image:
                width, height = image.size
                png_metadata = dict(getattr(image, "text", {}) or {})
            return web.json_response({
                "ok": True,
                "width": width,
                "height": height,
                "bytes": os.path.getsize(path),
                "png_metadata": png_metadata,
            })
        except Exception as exc:
            return web.json_response({"ok": False, "error": str(exc)}, status=404)

    @PromptServer.instance.routes.post("/nova_compare/save")
    async def nova_compare_save(request):
        try:
            reader = await request.multipart()
            image_bytes = b""
            prefix = "NovoLokoCompare"
            metadata_fields = {}
            while True:
                part = await reader.next()
                if part is None:
                    break
                if part.name == "filename_prefix":
                    prefix = await part.text()
                elif part.name == "metadata":
                    raw_metadata = await part.text()
                    try:
                        loaded = __import__("json").loads(raw_metadata)
                        if isinstance(loaded, dict):
                            metadata_fields = loaded
                    except Exception:
                        metadata_fields = {}
                elif part.name == "image":
                    chunks = []
                    size = 0
                    while True:
                        chunk = await part.read_chunk(size=1024 * 1024)
                        if not chunk:
                            break
                        size += len(chunk)
                        if size > 100 * 1024 * 1024:
                            raise ValueError("Compare image is too large to save.")
                        chunks.append(chunk)
                    image_bytes = b"".join(chunks)
            if not image_bytes:
                return web.json_response({"ok": False, "error": "No image was supplied."}, status=400)

            output_path = _next_output_path(prefix)

            def _save() -> None:
                from io import BytesIO
                with Image.open(BytesIO(image_bytes)) as image:
                    image.convert("RGB").save(
                        output_path,
                        format="PNG",
                        pnginfo=build_pnginfo(metadata_fields),
                        compress_level=4,
                    )

            await asyncio.to_thread(_save)
            return web.json_response({
                "ok": True,
                "filename": os.path.basename(output_path),
                "path": output_path,
                "folder": _compare_output_dir(),
            })
        except Exception as exc:
            return web.json_response({"ok": False, "error": str(exc) or "Compare image could not be saved."}, status=500)

    @PromptServer.instance.routes.post("/nova_compare/open_folder")
    async def nova_compare_open_folder(request):
        try:
            data = await request.json()
        except Exception:
            data = {}
        filename = os.path.basename(str(data.get("filename") or ""))
        reveal = bool(data.get("reveal"))
        directory = _compare_output_dir()
        target = os.path.join(directory, filename) if filename else directory
        try:
            opened = await asyncio.to_thread(_open_path, target, reveal)
            return web.json_response({"ok": True, "path": opened})
        except Exception as exc:
            return web.json_response({"ok": False, "error": str(exc) or "Compare folder could not be opened."}, status=500)

except Exception as exc:
    print(f"[ComfyUI-NovoLoko] NovoLoko Compare routes unavailable: {exc}")
