from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
from pathlib import Path


PREVIEW_SIZES = (512, 1024)
PREVIEW_EXTENSION = ".webp"
PREVIEW_MAX_UPLOAD_BYTES = 32 * 1024 * 1024
_SAFE_KEY = re.compile(r"^[0-9a-f]{16,64}$")
_LOCATION_CONFIG_NAME = "style_preview_location.json"


def _portable_library_name(resolved_library: str | os.PathLike[str], package_root: str | os.PathLike[str]) -> str:
    library = Path(resolved_library).resolve()
    root = Path(package_root).resolve()
    try:
        relative = library.relative_to(root)
        return relative.as_posix().casefold()
    except ValueError:
        # External libraries remain portable without revealing or hashing a
        # complete private path into browser-visible data.
        return f"external/{library.name.casefold()}"


def library_key(resolved_library: str | os.PathLike[str], package_root: str | os.PathLike[str]) -> str:
    portable = _portable_library_name(resolved_library, package_root)
    return hashlib.sha256(portable.encode("utf-8")).hexdigest()[:24]


def style_key(style_name: str) -> str:
    normalized = " ".join(str(style_name or "").strip().casefold().split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:32]


def _default_preview_root(package_root: str | os.PathLike[str]) -> Path:
    return Path(package_root).resolve() / "data" / "style_previews"


def preview_location_config_path(package_root: str | os.PathLike[str]) -> Path:
    return Path(package_root).resolve() / "data" / _LOCATION_CONFIG_NAME


def _configured_preview_root(package_root: str | os.PathLike[str]) -> Path | None:
    config_path = preview_location_config_path(package_root)
    try:
        payload = json.loads(config_path.read_text(encoding="utf-8"))
        configured = Path(str(payload.get("path") or "")).expanduser()
        if configured.is_absolute():
            return configured.resolve()
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        pass
    return None


def preview_root_is_configured(package_root: str | os.PathLike[str]) -> bool:
    return _configured_preview_root(package_root) is not None


def preview_root(package_root: str | os.PathLike[str]) -> Path:
    configured = _configured_preview_root(package_root)
    if configured is not None:
        return configured
    return _default_preview_root(package_root)


def configure_preview_root(
    package_root: str | os.PathLike[str],
    requested_path: str | os.PathLike[str] | None,
) -> Path:
    """Set or reset the runtime preview folder without tracking a private path."""
    config_path = preview_location_config_path(package_root)
    text = str(requested_path or "").strip()
    if not text:
        try:
            config_path.unlink()
        except FileNotFoundError:
            pass
        return _default_preview_root(package_root)
    if "\0" in text:
        raise ValueError("Preview folder contains an invalid character.")

    target = Path(text).expanduser()
    if not target.is_absolute():
        raise ValueError("Preview folder must be an absolute path.")
    target = target.resolve()
    target.mkdir(parents=True, exist_ok=True)

    probe_name = None
    try:
        handle, probe_name = tempfile.mkstemp(prefix=".novoloko-write-test-", dir=str(target))
        os.close(handle)
    finally:
        if probe_name and os.path.exists(probe_name):
            os.unlink(probe_name)

    config_path.parent.mkdir(parents=True, exist_ok=True)
    temp_name = None
    try:
        handle, temp_name = tempfile.mkstemp(
            prefix=f".{_LOCATION_CONFIG_NAME}.",
            suffix=".tmp",
            dir=str(config_path.parent),
        )
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as output:
            json.dump({"path": str(target)}, output, ensure_ascii=False, indent=2)
            output.write("\n")
        os.replace(temp_name, config_path)
        temp_name = None
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)
    return target


def open_preview_root(package_root: str | os.PathLike[str]) -> Path:
    root = preview_root(package_root)
    root.mkdir(parents=True, exist_ok=True)
    if os.name != "nt" or not hasattr(os, "startfile"):
        raise RuntimeError("Opening the preview folder is available on Windows.")
    os.startfile(str(root))
    return root


def preview_path(
    package_root: str | os.PathLike[str],
    resolved_library: str | os.PathLike[str],
    style_name: str,
) -> Path:
    return (
        preview_root(package_root)
        / library_key(resolved_library, package_root)
        / f"{style_key(style_name)}{PREVIEW_EXTENSION}"
    )


def safe_preview_path(package_root: str | os.PathLike[str], library_id: str, style_id: str) -> Path:
    if not _SAFE_KEY.fullmatch(str(library_id or "")) or not _SAFE_KEY.fullmatch(str(style_id or "")):
        raise ValueError("Invalid style-preview identifier.")
    root = preview_root(package_root)
    candidate = root / library_id / f"{style_id}{PREVIEW_EXTENSION}"
    resolved_root = root.resolve()
    resolved_candidate = candidate.resolve()
    if resolved_root not in resolved_candidate.parents:
        raise ValueError("Style-preview path escapes managed storage.")
    return resolved_candidate


def resize_and_store_preview(
    source,
    destination: str | os.PathLike[str],
    size: int,
) -> Path:
    if int(size) not in PREVIEW_SIZES:
        raise ValueError("Preview size must be 512 or 1024.")

    try:
        from PIL import Image, ImageOps
    except Exception as error:
        raise RuntimeError(
            "Style preview import requires Pillow from the ComfyUI Python environment."
        ) from error

    target = Path(destination)
    target.parent.mkdir(parents=True, exist_ok=True)
    temp_name = None
    try:
        with Image.open(source) as opened:
            image = ImageOps.exif_transpose(opened)
            if image.mode not in {"RGB", "RGBA"}:
                image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
            if image.mode == "RGBA":
                background = Image.new("RGB", image.size, (20, 22, 28))
                background.paste(image, mask=image.getchannel("A"))
                image = background
            else:
                image = image.convert("RGB")
            resampling = getattr(Image, "Resampling", Image)
            image = ImageOps.fit(
                image,
                (int(size), int(size)),
                method=resampling.LANCZOS,
                centering=(0.5, 0.5),
            )

            handle, temp_name = tempfile.mkstemp(
                prefix=".preview-",
                suffix=PREVIEW_EXTENSION,
                dir=str(target.parent),
            )
            os.close(handle)
            image.save(temp_name, "WEBP", quality=88, method=6)
        os.replace(temp_name, target)
        temp_name = None
        return target
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)
