from __future__ import annotations

import importlib
import sys
import types
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = "novoloko_omniloko_autostart_tests"


def load_module():
    package = sys.modules.get(PACKAGE)
    if package is None:
        package = types.ModuleType(PACKAGE)
        package.__path__ = [str(ROOT)]
        sys.modules[PACKAGE] = package
    sys.modules.pop(f"{PACKAGE}.omniloko_autostart", None)
    return importlib.import_module(f"{PACKAGE}.omniloko_autostart")


class _FakeProcess:
    pid = 1234

    def poll(self):
        return None


class OmniLokoAutoStartTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_module()

    def test_owned_process_closes_after_last_request(self) -> None:
        process = _FakeProcess()
        self.module._OWNED_PROCESS = process
        self.module._begin_request()
        with mock.patch.object(self.module, "_close_process") as close:
            self.module._end_request()
        close.assert_called_once_with(process)
        self.assertIsNone(self.module._OWNED_PROCESS)

    def test_concurrent_request_keeps_owned_process_until_idle(self) -> None:
        process = _FakeProcess()
        self.module._OWNED_PROCESS = process
        self.module._begin_request()
        self.module._begin_request()
        with mock.patch.object(self.module, "_close_process") as close:
            self.module._end_request()
            close.assert_not_called()
            self.module._end_request()
        close.assert_called_once_with(process)

    def test_existing_user_process_is_never_closed(self) -> None:
        self.module._OWNED_PROCESS = None
        self.module._begin_request()
        with mock.patch.object(self.module, "_close_process") as close:
            self.module._end_request()
        close.assert_not_called()

    def test_start_tracks_only_the_process_that_stays_running(self) -> None:
        process = _FakeProcess()
        fake_runtime = object()
        readiness = iter((False, True))
        with (
            mock.patch.object(self.module, "_bridge_is_ready", side_effect=lambda _module: next(readiness)),
            mock.patch.object(self.module, "_find_executable", return_value=Path("C:/OmniLoko/OmniLoko.exe")),
            mock.patch.object(self.module.subprocess, "Popen", return_value=process),
        ):
            self.module._start_bridge(fake_runtime, None)
        self.assertIs(process, self.module._OWNED_PROCESS)


if __name__ == "__main__":
    unittest.main()
