"""Lazy OmniLoko bridge auto-start for execution-time TTS requests.

The node schema may probe available voices while ComfyUI is starting. Those probes
must stay passive. OmniLoko is started only while an actual TTS node execution is
inside ``NovaOmniLokoTTS.speak``.
"""

from __future__ import annotations

import os
import subprocess
import threading
import time
from pathlib import Path
from typing import Any

_AUTO_START_LOCK = threading.Lock()
_EXECUTION_CONTEXT = threading.local()
_INSTALLED = False


def _logical_drive_roots() -> list[Path]:
    if os.name != "nt":
        return []
    try:
        import ctypes

        length = ctypes.windll.kernel32.GetLogicalDriveStringsW(0, None)
        if not length:
            return []
        buffer = ctypes.create_unicode_buffer(length)
        ctypes.windll.kernel32.GetLogicalDriveStringsW(length, buffer)
        return [Path(value) for value in buffer[:].split("\x00") if value]
    except Exception:
        return []


def _candidate_executables() -> list[Path]:
    candidates: list[Path] = []
    configured = os.environ.get("OMNILOKO_EXE", "").strip().strip('"')
    if configured:
        candidates.append(Path(configured))

    local_app_data = Path(os.environ.get("LOCALAPPDATA", "")) if os.environ.get("LOCALAPPDATA") else None
    program_files = [
        value
        for value in (os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)"))
        if value
    ]
    if local_app_data is not None:
        candidates.extend(
            [
                local_app_data / "OmniLoko" / "OmniLoko.exe",
                local_app_data / "Programs" / "OmniLoko" / "OmniLoko.exe",
                local_app_data / "NovoLokoLabs" / "OmniLoko" / "OmniLoko.exe",
            ]
        )
    candidates.extend(Path(root) / "OmniLoko" / "OmniLoko.exe" for root in program_files)

    # NovoLokoLabs' portable updater installs commonly use a drive-root product
    # folder. Enumerating these exact paths is quick and avoids a recursive disk scan.
    for root in _logical_drive_roots():
        candidates.extend(
            [
                root / "OmniVoice" / "OmniLoko" / "OmniLoko.exe",
                root / "OmniLoko" / "OmniLoko.exe",
                root / "NovoLokoLabs" / "OmniLoko" / "OmniLoko.exe",
            ]
        )

    unique: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        try:
            resolved = candidate.expanduser().resolve(strict=False)
        except Exception:
            resolved = candidate
        key = str(resolved).casefold()
        if key not in seen:
            seen.add(key)
            unique.append(resolved)
    return unique


def _find_executable() -> Path | None:
    return next((path for path in _candidate_executables() if path.is_file()), None)


def _bridge_is_ready(module: Any) -> bool:
    try:
        api = module._load_client_api()
        module._read_discovery(api)
        return True
    except Exception:
        return False


def _start_bridge(module: Any, deadline: float | None) -> None:
    with _AUTO_START_LOCK:
        if _bridge_is_ready(module):
            return

        executable = _find_executable()
        if executable is None:
            raise RuntimeError(
                "OmniLoko could not be auto-started because OmniLoko.exe was not found. "
                "Install OmniLoko with the NovoLokoLabs updater or set OMNILOKO_EXE to its full path."
            )

        creation_flags = 0x08000000 if os.name == "nt" else 0  # CREATE_NO_WINDOW
        try:
            process = subprocess.Popen(
                [str(executable), "--bridge-only"],
                cwd=str(executable.parent),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                close_fds=True,
                creationflags=creation_flags,
            )
        except Exception as exc:
            raise RuntimeError(f"OmniLoko could not be auto-started: {exc}") from exc

        stop_at = time.monotonic() + 20.0
        if deadline is not None:
            stop_at = min(stop_at, deadline)
        while time.monotonic() < stop_at:
            if _bridge_is_ready(module):
                return
            # Exit code 17 means another process already owns the bridge. Keep
            # waiting briefly for that owner's discovery file to become visible.
            if process.poll() not in (None, 17):
                break
            time.sleep(0.25)

        raise RuntimeError(
            "OmniLoko was started automatically, but its private local bridge did not become ready in time."
        )


def _is_unavailable_error(exception: BaseException) -> bool:
    message = str(exception).casefold()
    return any(
        marker in message
        for marker in (
            "omniloko is unavailable",
            "start omniloko",
            "health mismatch",
            "bridge did not become ready",
        )
    )


def install(module: Any) -> None:
    """Install one execution-scoped auto-start shim into ``lokobridge_nodes``."""

    global _INSTALLED
    if _INSTALLED:
        return
    _INSTALLED = True

    original_connect = module._connect
    original_speak = module.NovaOmniLokoTTS.speak

    def connect(deadline: float | None = None, request_limit: float | None = None):
        try:
            return original_connect(deadline=deadline, request_limit=request_limit)
        except RuntimeError as exc:
            if not getattr(_EXECUTION_CONTEXT, "active", False) or not _is_unavailable_error(exc):
                raise
            _start_bridge(module, deadline)
            return original_connect(deadline=deadline, request_limit=request_limit)

    def speak(self, *args, **kwargs):
        previous = getattr(_EXECUTION_CONTEXT, "active", False)
        _EXECUTION_CONTEXT.active = True
        try:
            return original_speak(self, *args, **kwargs)
        except RuntimeError as exc:
            cause = exc.__cause__
            if str(exc) == getattr(module, "_STALE_PRESET_MESSAGE", "") and cause is not None:
                if "auto-start" in str(cause).casefold() or "bridge did not become ready" in str(cause).casefold():
                    raise cause
            raise
        finally:
            _EXECUTION_CONTEXT.active = previous

    module._connect = connect
    module.NovaOmniLokoTTS.speak = speak
