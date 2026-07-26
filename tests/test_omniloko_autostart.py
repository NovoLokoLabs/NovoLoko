from __future__ import annotations

import importlib
import os
import subprocess
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

    def test_auto_start_launches_hidden_and_keeps_windows_hidden(self) -> None:
        process = _FakeProcess()
        fake_runtime = object()
        readiness = iter((False, True))
        executable = Path("C:/OmniLoko/OmniLoko.exe")
        with (
            mock.patch.object(self.module, "_bridge_is_ready", side_effect=lambda _module: next(readiness)),
            mock.patch.object(self.module, "_find_executable", return_value=executable),
            mock.patch.object(self.module, "_launch_process", return_value=process) as launch,
            mock.patch.object(self.module, "_hide_process_windows") as hide,
        ):
            self.module._start_bridge(fake_runtime, None)

        launch.assert_called_once_with(executable, hidden=True)
        self.assertGreaterEqual(hide.call_count, 2)
        hide.assert_called_with(process.pid)

    @unittest.skipUnless(os.name == "nt", "Windows startup visibility is Windows-only")
    def test_hidden_windows_launch_uses_hidden_startup_info(self) -> None:
        executable = Path("C:/OmniLoko/OmniLoko.exe")
        process = _FakeProcess()
        with mock.patch.object(self.module.subprocess, "Popen", return_value=process) as popen:
            launched = self.module._launch_process(executable, hidden=True)

        self.assertIs(process, launched)
        startupinfo = popen.call_args.kwargs["startupinfo"]
        self.assertTrue(startupinfo.dwFlags & subprocess.STARTF_USESHOWWINDOW)
        self.assertEqual(subprocess.SW_HIDE, startupinfo.wShowWindow)

    def test_manual_open_restores_and_disowns_auto_started_process(self) -> None:
        process = _FakeProcess()
        executable = Path("C:/OmniLoko/OmniLoko.exe")
        self.module._OWNED_PROCESS = process
        with (
            mock.patch.object(self.module, "_find_executable", return_value=executable),
            mock.patch.object(self.module, "_show_process_windows", return_value=True) as show,
            mock.patch.object(self.module, "_launch_process") as launch,
        ):
            opened = self.module.open_visible()

        self.assertEqual(str(executable), opened)
        self.assertIsNone(self.module._OWNED_PROCESS)
        show.assert_called_once_with(process.pid)
        launch.assert_not_called()

    def test_manual_open_launches_visible_when_no_owned_process_exists(self) -> None:
        executable = Path("C:/OmniLoko/OmniLoko.exe")
        self.module._OWNED_PROCESS = None
        with (
            mock.patch.object(self.module, "_find_executable", return_value=executable),
            mock.patch.object(self.module, "_launch_process") as launch,
        ):
            opened = self.module.open_visible()

        self.assertEqual(str(executable), opened)
        launch.assert_called_once_with(executable, hidden=False)


if __name__ == "__main__":
    unittest.main()
