"""Frontend-backed workflow presentation nodes."""

from __future__ import annotations

import os
import platform
import subprocess
from pathlib import Path

try:
    import folder_paths
except ModuleNotFoundError:  # Import-safe for package inspection outside ComfyUI.
    folder_paths = None

try:
    from aiohttp import web
    from server import PromptServer
except Exception:  # Import-safe outside a running ComfyUI server.
    web = None
    PromptServer = None


class _NovaPresentationNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    FUNCTION = "render"
    CATEGORY = "NovoLoko/Workflow"

    @staticmethod
    def render():
        return ()


class NovaWorkflowBanner(_NovaPresentationNode):
    """Resizable title and clickable workflow-link banner."""


class NovaWorkflowGuide(_NovaPresentationNode):
    """Resizable workflow cheat sheet with editable model links."""


NODE_CLASS_MAPPINGS = {
    "NovaWorkflowBanner": NovaWorkflowBanner,
    "NovaWorkflowGuide": NovaWorkflowGuide,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NovaWorkflowBanner": "NovoLoko Workflow Banner",
    "NovaWorkflowGuide": "NovoLoko Workflow Cheat Sheet",
}


def _resolve_comfy_folder(value: str) -> Path:
    """Resolve a user-facing ComfyUI folder without allowing arbitrary paths."""

    text = str(value or "").strip().replace("\\", "/")
    if not text:
        raise ValueError("No folder was supplied.")
    while text.startswith("./"):
        text = text[2:]
    if text.lower().startswith("comfyui/"):
        text = text[8:]
    if Path(text).is_absolute():
        raise ValueError("Use a folder relative to this ComfyUI installation.")

    base = Path(folder_paths.base_path).resolve()
    target = (base / text).resolve()
    try:
        target.relative_to(base)
    except ValueError as error:
        raise ValueError("Folder must stay inside this ComfyUI installation.") from error
    if not target.is_dir():
        raise ValueError(f"Folder does not exist: {text}")
    return target


if PromptServer is not None and web is not None:
    @PromptServer.instance.routes.post("/nova_workflow/open_folder")
    async def nova_workflow_open_folder(request):
        try:
            payload = await request.json()
            target = _resolve_comfy_folder(payload.get("folder", ""))
            system = platform.system()
            if system == "Windows":
                os.startfile(str(target))  # type: ignore[attr-defined]
            elif system == "Darwin":
                subprocess.Popen(["open", str(target)])
            else:
                subprocess.Popen(["xdg-open", str(target)])
            return web.json_response({"ok": True, "folder": str(target)})
        except Exception as error:
            return web.json_response(
                {"ok": False, "error": str(error)[:500]},
                status=400,
            )
