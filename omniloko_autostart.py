"""Lazy OmniLoko app auto-start for execution-time TTS requests.

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
_OWNED_PROCESS: subprocess.Popen | None = None
_ACTIVE_REQUESTS = 0


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


def _launch_process(executable: Path, hidden: bool) -> subprocess.Popen:
    kwargs: dict[str, Any] = {
        "cwd": str(executable.parent),
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
        "close_fds": True,
    }
    if hidden and os.name == "nt":
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = subprocess.SW_HIDE
        kwargs["startupinfo"] = startupinfo
    return subprocess.Popen([str(executable)], **kwargs)


def _set_process_windows(pid: int, show_command: int, foreground: bool = False) -> bool:
    if os.name != "nt":
        return False
    try:
        import ctypes
        from ctypes import wintypes

        changed = False
        enum_proc_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

        def visit(hwnd, _lparam):
            nonlocal changed
            window_pid = wintypes.DWORD()
            ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(window_pid))
            if window_pid.value == int(pid):
                ctypes.windll.user32.ShowWindow(hwnd, int(show_command))
                if foreground:
                    ctypes.windll.user32.SetForegroundWindow(hwnd)
                changed = True
            return True

        callback = enum_proc_type(visit)
        ctypes.windll.user32.EnumWindows(callback, 0)
        return changed
    except Exception:
        return False


def _hide_process_windows(pid: int) -> bool:
    return _set_process_windows(pid, 0)


def _show_process_windows(pid: int) -> bool:
    return _set_process_windows(pid, 9, foreground=True)


def _start_bridge(module: Any, deadline: float | None) -> None:
    global _OWNED_PROCESS
    with _AUTO_START_LOCK:
        if _bridge_is_ready(module):
            return

        executable = _find_executable()
        if executable is None:
            raise RuntimeError(
                "OmniLoko could not be auto-started because OmniLoko.exe was not found. "
                "Install OmniLoko with the NovoLokoLabs updater or set OMNILOKO_EXE to its full path."
            )

        try:
            process = _launch_process(executable, hidden=True)
        except Exception as exc:
            raise RuntimeError(f"OmniLoko could not be auto-started: {exc}") from exc

        stop_at = time.monotonic() + 20.0
        if deadline is not None:
            stop_at = min(stop_at, deadline)
        while time.monotonic() < stop_at:
            _hide_process_windows(int(process.pid))
            if _bridge_is_ready(module):
                if process.poll() is None:
                    _hide_process_windows(int(process.pid))
                    _OWNED_PROCESS = process
                return
            # Exit code 17 means another process already owns the bridge. Keep
            # waiting briefly for that owner's discovery file to become visible.
            if process.poll() not in (None, 17):
                break
            time.sleep(0.25)

        _close_process(process)
        raise RuntimeError(
            "OmniLoko was opened automatically, but its private local bridge did not become ready in time."
        )


def open_visible() -> str:
    """Open OmniLoko visibly, or restore and disown an auto-started instance."""

    global _OWNED_PROCESS
    with _AUTO_START_LOCK:
        process = _OWNED_PROCESS
        if process is not None and process.poll() is None:
            _OWNED_PROCESS = None
        else:
            process = None

    executable = _find_executable()
    if executable is None:
        raise RuntimeError(
            "OmniLoko.exe was not found. Install OmniLoko with the NovoLokoLabs updater "
            "or set OMNILOKO_EXE to its full path."
        )

    if process is not None:
        stop_at = time.monotonic() + 5.0
        while process.poll() is None and time.monotonic() < stop_at:
            if _show_process_windows(int(process.pid)):
                return str(executable)
            time.sleep(0.1)

    _launch_process(executable, hidden=False)
    return str(executable)


def _post_close_to_windows(pid: int) -> bool:
    if os.name != "nt":
        return False
    try:
        import ctypes
        from ctypes import wintypes

        posted = False
        enum_proc_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

        def visit(hwnd, _lparam):
            nonlocal posted
            window_pid = wintypes.DWORD()
            ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(window_pid))
            if window_pid.value == int(pid) and ctypes.windll.user32.IsWindowVisible(hwnd):
                ctypes.windll.user32.PostMessageW(hwnd, 0x0010, 0, 0)  # WM_CLOSE
                posted = True
            return True

        callback = enum_proc_type(visit)
        ctypes.windll.user32.EnumWindows(callback, 0)
        return posted
    except Exception:
        return False


def _close_process(process: subprocess.Popen) -> None:
    """Close only an OmniLoko process started by this module."""

    if process.poll() is not None:
        return
    if _post_close_to_windows(int(process.pid)):
        try:
            process.wait(timeout=15)
            return
        except subprocess.TimeoutExpired:
            pass
    try:
        process.terminate()
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)
    except Exception:
        pass


def _begin_request() -> None:
    global _ACTIVE_REQUESTS
    with _AUTO_START_LOCK:
        _ACTIVE_REQUESTS += 1


def _end_request() -> None:
    global _ACTIVE_REQUESTS, _OWNED_PROCESS
    process = None
    with _AUTO_START_LOCK:
        _ACTIVE_REQUESTS = max(0, _ACTIVE_REQUESTS - 1)
        if _ACTIVE_REQUESTS == 0 and _OWNED_PROCESS is not None:
            process = _OWNED_PROCESS
            _OWNED_PROCESS = None
    if process is not None:
        _close_process(process)


def ensure_running(module: Any, deadline: float | None = None) -> None:
    """Open OmniLoko only for an explicit OmniLoko execution that needs its bridge."""

    if not _bridge_is_ready(module):
        _start_bridge(module, deadline)


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
        _begin_request()
        try:
            return original_speak(self, *args, **kwargs)
        except RuntimeError as exc:
            cause = exc.__cause__
            if str(exc) == getattr(module, "_STALE_PRESET_MESSAGE", "") and cause is not None:
                if "auto-start" in str(cause).casefold() or "bridge did not become ready" in str(cause).casefold():
                    raise cause
            raise
        finally:
            _end_request()
            _EXECUTION_CONTEXT.active = previous

    module._connect = connect
    module.NovaOmniLokoTTS.speak = speak
