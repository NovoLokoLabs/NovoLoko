"""NovoLoko LoRA stack and frontend-only group controller."""

from __future__ import annotations

import hashlib
import json
import os
import random
import re
import ssl
import threading
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

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


_MAX_ROWS = 100
_MAX_JSON_BYTES = 8 * 1024 * 1024
_MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024 * 1024
_CIVITAI_API = "https://civitai.com/api/v1"
_CIVITAI_DOWNLOAD = "https://civitai.com/api/download/models"
_ROUTES_INSTALLED = False
_ROUTES_LOCK = threading.Lock()


class _AnyType(str):
    def __eq__(self, _other: object) -> bool:
        return True

    def __ne__(self, _other: object) -> bool:
        return False


ANY = _AnyType("*")


def _clean_rows(value: Any) -> list[dict[str, Any]]:
    try:
        rows = json.loads(str(value or "[]"))
    except (TypeError, ValueError, json.JSONDecodeError):
        rows = []
    if not isinstance(rows, list):
        return []
    cleaned: list[dict[str, Any]] = []
    for item in rows[:_MAX_ROWS]:
        if not isinstance(item, dict):
            continue
        name = str(item.get("lora") or "").strip()
        if not name or len(name) > 1024:
            continue
        cleaned.append({
            "id": str(item.get("id") or "")[:80],
            "lora": name,
            "enabled": bool(item.get("enabled", True)),
            "random_pool": bool(item.get("random_pool", False)),
            "strength_model": max(-20.0, min(20.0, float(item.get("strength_model", 1.0)))),
            "strength_clip": max(-20.0, min(20.0, float(item.get("strength_clip", 1.0)))),
            "triggers": [
                str(word).strip()
                for word in (item.get("triggers") or [])[:32]
                if str(word).strip()
            ],
        })
    return cleaned


def _selected_rows(rows: list[dict[str, Any]], mode: str, count: int, seed: int) -> list[dict[str, Any]]:
    enabled = [row for row in rows if row["enabled"]]
    if str(mode) != "Seeded random pool":
        return enabled
    always = [row for row in enabled if not row["random_pool"]]
    pool = [row for row in enabled if row["random_pool"]]
    take = max(0, min(int(count), len(pool)))
    chosen = random.Random(int(seed)).sample(pool, take) if take else []
    selected_ids = {id(row) for row in always + chosen}
    return [row for row in enabled if id(row) in selected_ids]


class NovaPowerLoraStack:
    """Apply a serialized, dynamically edited stack of LoRAs."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "enabled": ("BOOLEAN", {"default": True}),
                "random_mode": (
                    ["Manual", "Seeded random pool"],
                    {"default": "Manual"},
                ),
                "random_count": ("INT", {"default": 1, "min": 0, "max": 100}),
                "seed": (
                    "INT",
                    {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF},
                ),
                "stack_json": (
                    "STRING",
                    {"default": "[]", "multiline": True},
                ),
            },
        }

    RETURN_TYPES = ("MODEL", "CLIP", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("MODEL", "CLIP", "active_loras", "trigger_words", "status")
    FUNCTION = "apply"
    CATEGORY = "NovoLoko/Loaders"

    def apply(
        self,
        model,
        clip,
        enabled=True,
        random_mode="Manual",
        random_count=1,
        seed=0,
        stack_json="[]",
    ):
        rows = _clean_rows(stack_json)
        selected = _selected_rows(rows, random_mode, random_count, seed) if enabled else []
        active: list[str] = []
        triggers: list[str] = []
        errors: list[str] = []

        if selected:
            import comfy.sd
            import comfy.utils

        for row in selected:
            name = row["lora"]
            path = folder_paths.get_full_path("loras", name)
            if not path or not os.path.isfile(path):
                errors.append(f"Missing: {name}")
                continue
            try:
                weights = comfy.utils.load_torch_file(path, safe_load=True)
                model, clip = comfy.sd.load_lora_for_models(
                    model,
                    clip,
                    weights,
                    row["strength_model"],
                    row["strength_clip"],
                )
                active.append(name)
                for word in row["triggers"]:
                    if word not in triggers:
                        triggers.append(word)
            except Exception as exc:
                errors.append(f"{name}: {exc}")

        status = f"Applied {len(active)} of {len(rows)} LoRAs"
        if str(random_mode) == "Seeded random pool":
            status += f" • seed {int(seed)}"
        if errors:
            status += " • " + " | ".join(errors[:5])
        return model, clip, ", ".join(active), ", ".join(triggers), status


class NovaGroupController:
    """Frontend controller; the output exists only for optional workflow anchoring."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "state_json": ("STRING", {"default": "{}", "multiline": True}),
            },
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("OPT_CONNECTION",)
    FUNCTION = "passthrough"
    CATEGORY = "NovoLoko/Workflow"
    OUTPUT_NODE = True

    def passthrough(self, state_json="{}"):
        return (None,)


def _headers() -> dict[str, str]:
    headers = {
        "Accept": "application/json",
        "User-Agent": "NovoLoko/4.0.0",
    }
    token = os.environ.get("CIVITAI_API_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _ssl_context() -> ssl.SSLContext:
    """Use the embedded runtime's maintained CA bundle without weakening TLS."""
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _json_request(url: str) -> dict[str, Any]:
    request = urllib.request.Request(url, headers=_headers())
    with urllib.request.urlopen(
        request,
        timeout=20,
        context=_ssl_context(),
    ) as response:
        data = response.read(_MAX_JSON_BYTES + 1)
    if len(data) > _MAX_JSON_BYTES:
        raise RuntimeError("CivitAI returned an oversized response.")
    result = json.loads(data.decode("utf-8"))
    if not isinstance(result, dict):
        raise RuntimeError("CivitAI returned invalid JSON.")
    return result


def _lora_roots() -> list[Path]:
    return [Path(path).resolve() for path in folder_paths.get_folder_paths("loras")]


def _safe_local_lora(name: str) -> Path:
    clean = str(name or "").replace("\\", "/").strip("/")
    if not clean or ".." in clean.split("/"):
        raise ValueError("Invalid LoRA name.")
    for root in _lora_roots():
        candidate = (root / Path(*clean.split("/"))).resolve()
        try:
            candidate.relative_to(root)
        except ValueError:
            continue
        if candidate.is_file():
            return candidate
    raise FileNotFoundError("LoRA file was not found.")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _metadata_cache() -> Path:
    root = Path(folder_paths.get_user_directory()) / "novoloko" / "lora-metadata"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _local_info(name: str, refresh: bool) -> dict[str, Any]:
    path = _safe_local_lora(name)
    digest = _sha256(path)
    cache = _metadata_cache() / f"{digest}.json"
    if cache.is_file() and not refresh:
        return json.loads(cache.read_text(encoding="utf-8"))
    try:
        data = _json_request(f"{_CIVITAI_API}/model-versions/by-hash/{digest}")
    except Exception as exc:
        data = {"error": str(exc), "sha256": digest}
    data["sha256"] = digest
    data["localName"] = name
    cache.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


def _safe_filename(value: str, fallback: str) -> str:
    name = Path(str(value or "")).name
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip(" .")
    if not name.lower().endswith((".safetensors", ".ckpt", ".pt")):
        name = f"{name or fallback}.safetensors"
    return name[:240]


def _download_version(version_id: int, filename: str) -> str:
    root = _lora_roots()[0] / "NovoLoko-CivitAI"
    root.mkdir(parents=True, exist_ok=True)
    target = root / _safe_filename(filename, f"civitai-{version_id}")
    if target.exists():
        return str(target.relative_to(_lora_roots()[0])).replace("/", "\\")
    url = f"{_CIVITAI_DOWNLOAD}/{int(version_id)}"
    request = urllib.request.Request(url, headers=_headers())
    part = target.with_suffix(target.suffix + ".part")
    received = 0
    try:
        with urllib.request.urlopen(
            request,
            timeout=60,
            context=_ssl_context(),
        ) as response, part.open("wb") as output:
            while True:
                block = response.read(4 * 1024 * 1024)
                if not block:
                    break
                received += len(block)
                if received > _MAX_DOWNLOAD_BYTES:
                    raise RuntimeError("CivitAI download exceeded the 8 GB safety limit.")
                output.write(block)
        part.replace(target)
    except urllib.error.HTTPError as exc:
        part.unlink(missing_ok=True)
        if exc.code == 401:
            raise PermissionError(
                "CivitAI requires an account or API token for this download. "
                "Open the model page to download it there."
            ) from exc
        if exc.code == 403:
            raise PermissionError(
                "CivitAI has restricted this download. Open the model page for access details."
            ) from exc
        raise
    except Exception:
        part.unlink(missing_ok=True)
        raise
    folder_paths.get_filename_list("loras")
    return str(target.relative_to(_lora_roots()[0])).replace("/", "\\")


def _install_routes() -> None:
    global _ROUTES_INSTALLED
    if PromptServer is None or web is None:
        return
    with _ROUTES_LOCK:
        if _ROUTES_INSTALLED:
            return
        _ROUTES_INSTALLED = True

    @PromptServer.instance.routes.get("/nova_lora/installed")
    async def installed(_request):
        return web.json_response({
            "ok": True,
            "items": list(folder_paths.get_filename_list("loras")),
        })

    @PromptServer.instance.routes.get("/nova_lora/info")
    async def info(request):
        try:
            name = request.query.get("name", "")
            refresh = request.query.get("refresh", "0") == "1"
            data = await __import__("asyncio").to_thread(_local_info, name, refresh)
            return web.json_response({"ok": True, "item": data})
        except Exception as exc:
            return web.json_response({"ok": False, "error": str(exc)}, status=400)

    @PromptServer.instance.routes.get("/nova_lora/civitai/search")
    async def search(request):
        try:
            query = str(request.query.get("query", ""))[:200].strip()
            api_params = {
                "limit": max(1, min(int(request.query.get("limit", "24")), 50)),
                "types": "LORA",
                "sort": str(request.query.get("sort", "Highest Rated")),
                "period": str(request.query.get("period", "AllTime")),
                "nsfw": "true" if request.query.get("nsfw", "0") == "1" else "false",
            }
            if query:
                # CivitAI rejects page-based pagination when query search is used.
                # The first query page is returned when neither page nor cursor is sent.
                api_params["query"] = query
            else:
                api_params["page"] = max(1, int(request.query.get("page", "1")))
            params = urllib.parse.urlencode(api_params)
            data = await __import__("asyncio").to_thread(
                _json_request,
                f"{_CIVITAI_API}/models?{params}",
            )
            return web.json_response({"ok": True, **data})
        except Exception as exc:
            return web.json_response({"ok": False, "error": str(exc)}, status=502)

    @PromptServer.instance.routes.post("/nova_lora/civitai/download")
    async def download(request):
        try:
            body = await request.json()
            version_id = int(body.get("versionId"))
            filename = str(body.get("filename") or "")
            name = await __import__("asyncio").to_thread(
                _download_version,
                version_id,
                filename,
            )
            return web.json_response({"ok": True, "name": name})
        except Exception as exc:
            return web.json_response({"ok": False, "error": str(exc)}, status=400)


_install_routes()


NODE_CLASS_MAPPINGS = {
    "NovaPowerLoraStack": NovaPowerLoraStack,
    "NovaGroupController": NovaGroupController,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NovaPowerLoraStack": "NovoLoko Power LoRA Stack",
    "NovaGroupController": "NovoLoko Group Controller",
}
