"""Keep Media Studio history loading out of the ComfyUI execution critical path.

The Media Studio node saves the new WAV, metadata, and full-resolution history
images during execution. Older releases then synchronously re-read up to the
configured history limit before returning the node result. A large library can
therefore leave ComfyUI apparently stuck on Media Studio even though the new
entry has already been written.

The frontend already refreshes history through ``/nova_voice/audio/history``
after ``onExecuted``. This patch leaves that established behaviour intact while
returning only the new entry from the execution itself. No files, resolutions,
metadata, or user history limits are changed.
"""

from __future__ import annotations

import threading
from typing import Any

from . import voice_nodes as _voice


_EXECUTION_CONTEXT = threading.local()
_ORIGINAL_HISTORY_ENTRIES = _voice._audio_history_entries
_ORIGINAL_SAVE_AND_SHOW = _voice.NovaAudioHistoryPlayer.save_and_show


def _history_entries_outside_execution(limit: int = 1000):
    """Skip the redundant full-library scan only while the node is executing."""
    if bool(getattr(_EXECUTION_CONTEXT, "media_studio_save", False)):
        return []
    return _ORIGINAL_HISTORY_ENTRIES(limit)


def _save_and_show_without_inline_history(self, *args: Any, **kwargs: Any):
    previous = bool(getattr(_EXECUTION_CONTEXT, "media_studio_save", False))
    _EXECUTION_CONTEXT.media_studio_save = True
    try:
        return _ORIGINAL_SAVE_AND_SHOW(self, *args, **kwargs)
    finally:
        if previous:
            _EXECUTION_CONTEXT.media_studio_save = True
        else:
            try:
                delattr(_EXECUTION_CONTEXT, "media_studio_save")
            except AttributeError:
                pass


_voice._audio_history_entries = _history_entries_outside_execution
_voice.NovaAudioHistoryPlayer.save_and_show = _save_and_show_without_inline_history

print(
    "[ComfyUI-NovoLoko] Media Studio deferred history refresh active; "
    "full-resolution saves and configured history limits are unchanged."
)
