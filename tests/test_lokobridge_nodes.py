from __future__ import annotations

import builtins
import contextlib
import importlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import threading
import time
import types
import unittest
import urllib.error
import urllib.request
import uuid
import wave
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
PACKAGE_NAME = "novoloko_lokobridge_tests"
PROFILE_VOICE = "Current OmniLoko Profile"
EXISTING_NODE_IDS = {
    "NovaLoadStylesCSVPro",
    "NovaLoadCharactersCSVPro",
    "NovaPromptBuilderPreEnhance",
    "NovaTextPrompt",
    "NovaPromptPreview",
    "NovaPromptStyleSwitch",
    "NovaPromptStyleCharacterSwitch",
    "NovaPromptTwoStyleCharacterSwitch",
    "NovaStyleCharacterMixer",
    "NovaPromptSpice",
    "NovaSecretSaucePrompt",
    "NovaOverlayTextPro",
    "NovaPromptLogger",
    "NovaVoicePrompt",
    "NovaPromptSpeechSelector",
    "NovaKokoroTTS",
    "NovaAudioAutoplayTrigger",
    "NovaAudioHistoryPlayer",
    "NovaKokoroSpeechBridge",
    "NovaPromptStackAIO",
    "NovaImageComparePro",
    "NovaPromptStyler",
    "NovaPromptStackSwitch",
    "NovaSaveImageMetadata",
    "NovaDynamicTextConcatenate",
    "NovaSeedLab",
    "NovaGenerationTimer",
    "NovaPreviewPassThrough",
    "NovaMemoryManager",
    "NovaPromptEnhancer",
    "NovaTextDisplay",
}


def load_node_module():
    package = sys.modules.get(PACKAGE_NAME)
    if package is None:
        package = types.ModuleType(PACKAGE_NAME)
        package.__path__ = [str(ROOT)]
        sys.modules[PACKAGE_NAME] = package
    return importlib.import_module(f"{PACKAGE_NAME}.lokobridge_nodes")


def load_complete_package(name: str):
    spec = importlib.util.spec_from_file_location(
        name,
        ROOT / "__init__.py",
        submodule_search_locations=[str(ROOT)],
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def wave_bytes(sample_rate: int = 24_000, frames: int = 480) -> bytes:
    stream = io.BytesIO()
    with wave.open(stream, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        output.writeframes(b"\0\0" * frames)
    return stream.getvalue()


class _FakeBridgeApiError(RuntimeError):
    def __init__(self, status: int, error):
        super().__init__(error.message)
        self.status = status
        self.error = error


class _FakeCapabilities:
    def __init__(self, value: dict):
        self.capabilities_revision = int(value["capabilitiesRevision"])
        self.names = frozenset(value["capabilities"])

    def supports(self, name: str) -> bool:
        return name in self.names


class _FakeTensor:
    def __init__(self, array):
        self.array = array

    @property
    def shape(self):
        return self.array.shape

    def unsqueeze(self, dimension: int):
        import numpy as np

        return _FakeTensor(np.expand_dims(self.array, dimension))


class _FakeSoundFile:
    def __init__(self, stream):
        self._wave = wave.open(stream, "rb")
        self.format = "WAV"
        self.samplerate = self._wave.getframerate()
        self.frames = self._wave.getnframes()
        self.channels = self._wave.getnchannels()

    def read(self, dtype="float32", always_2d=False):
        import numpy as np

        if dtype != "float32":
            raise ValueError("test fake supports float32 only")
        data = np.frombuffer(self._wave.readframes(self.frames), dtype="<i2").astype(np.float32) / 32768.0
        data = data.reshape(-1, self.channels)
        return data if always_2d else data.squeeze()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self._wave.close()


def _fake_parse_discovery(text: str):
    value = json.loads(text)
    if value.get("protocolMajor") != 1:
        raise ValueError("unsupported protocol")
    instance_id = str(value["instanceId"])
    uuid.UUID(instance_id)
    token = str(value["bearerToken"])
    if len(token) < 32:
        raise ValueError("invalid token")
    port = int(value["port"])
    return types.SimpleNamespace(
        protocol_major=1,
        protocol_minor=int(value["protocolMinor"]),
        capabilities_revision=int(value["capabilitiesRevision"]),
        port=port,
        pid=int(value["pid"]),
        instance_id=instance_id,
        bearer_token=token,
        started_at_utc=str(value["startedAtUtc"]),
        base_url=f"http://127.0.0.1:{port}/lokobridge/v1/",
    )


class _FakeLokoBridgeClient:
    def __init__(self, discovery, transport=None, metadata_timeout=5.0):
        self.discovery = discovery
        self.transport = transport or self._urllib_transport
        self.metadata_timeout = metadata_timeout

    @staticmethod
    def _urllib_transport(method, url, headers, body, timeout):
        request = urllib.request.Request(url, data=body, headers=dict(headers), method=method)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.status, dict(response.headers.items()), response.read()
        except urllib.error.HTTPError as exc:
            return exc.code, dict(exc.headers.items()), exc.read()

    def _request(self, method, path, body=None, authenticate=True, timeout=None):
        headers = {"Content-Type": "application/json"} if body is not None else {}
        if authenticate:
            headers["Authorization"] = f"Bearer {self.discovery.bearer_token}"
        status, _response_headers, payload = self.transport(
            method,
            self.discovery.base_url + path,
            headers,
            body,
            timeout or self.metadata_timeout,
        )
        if 200 <= status < 300:
            return payload
        value = json.loads(payload)
        error = types.SimpleNamespace(
            code=value["code"],
            message=value["message"],
            retryable=value["retryable"],
            diagnostic_id=value["diagnosticId"],
            request_id=value["requestId"],
        )
        raise _FakeBridgeApiError(status, error)

    def _json(self, method, path, body=None, authenticate=True, timeout=None):
        return json.loads(self._request(method, path, body, authenticate, timeout))

    def health(self):
        return self._json("GET", "health", authenticate=False, timeout=2.0)

    def capabilities(self):
        return _FakeCapabilities(self._json("GET", "capabilities"))

    def presets(self):
        return self._json("GET", "presets")

    @staticmethod
    def _job(value: dict):
        error_value = value.get("error")
        error = None
        if isinstance(error_value, dict):
            error = types.SimpleNamespace(
                code=error_value["code"],
                message=error_value["message"],
                retryable=error_value["retryable"],
                diagnostic_id=error_value["diagnosticId"],
                request_id=error_value["requestId"],
            )
        return types.SimpleNamespace(
            id=value["id"],
            request_id=value["requestId"],
            state=value["state"],
            audio_available=bool(value.get("audioAvailable", False)),
            error=error,
        )

    def create_speech_job(self, request):
        body = json.dumps(request, separators=(",", ":")).encode("utf-8")
        return self._job(self._json("POST", "jobs/speech", body, timeout=10.0))

    def get_job(self, job_id):
        return self._job(self._json("GET", f"jobs/{job_id}"))

    def get_job_audio(self, job_id, timeout=60.0):
        return self._request("GET", f"jobs/{job_id}/audio", timeout=timeout)

    def cancel_job(self, job_id):
        return self._json("DELETE", f"jobs/{job_id}", timeout=10.0)


def fake_client_modules():
    models = types.ModuleType("lokobridge_client.models")
    models.discovery_path = lambda: Path(os.environ["LOCALAPPDATA"]) / "OmniLoko" / "Bridge" / "endpoint-v1.json"
    api = types.ModuleType("lokobridge_client")
    api.BridgeApiError = _FakeBridgeApiError
    api.LokoBridgeClient = _FakeLokoBridgeClient
    api.models = models
    api.parse_discovery = _fake_parse_discovery
    return api, models


def fake_audio_modules():
    import numpy as np

    torch = types.ModuleType("torch")
    torch.float32 = np.float32
    torch.zeros = lambda shape, dtype=None: _FakeTensor(np.zeros(shape, dtype=dtype or np.float32))
    torch.from_numpy = lambda array: _FakeTensor(np.asarray(array))
    soundfile = types.ModuleType("soundfile")
    soundfile.SoundFile = _FakeSoundFile
    return torch, soundfile


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, _format, *args):
        return

    def do_GET(self):
        self.server.owner.handle(self)

    def do_POST(self):
        self.server.owner.handle(self)

    def do_DELETE(self):
        self.server.owner.handle(self)


class FakeLokoBridgeHost:
    def __init__(self):
        self.token = "test-token-" + "x" * 48
        self.instance_id = "7ac3dbf4-d869-4c36-a9d1-2f61d7bfa6ce"
        self.health_instance_id = self.instance_id
        self.capabilities_revision = 1
        self.capabilities = {"speech.generate@1", "audio.wav@1", "voice.preset.list@1", "jobs.cancel@1"}
        self.preset_status = 200
        self.presets = [{"id": "opaque-preset-123", "displayName": "Test Voice", "format": "pt", "language": "en"}]
        self.states = ["completed"]
        self.audio = wave_bytes()
        self.audio_content_type: str | None = "audio/wav; charset=binary"
        self.failed_message: str | None = None
        self.response_delay = 0.0
        self.redirects: dict[str, tuple[int, str]] = {}
        self.response_overrides: dict[str, dict] = {}
        self.requests: list[dict] = []
        self.cancellations = 0
        self._job_reads = 0
        self._closed = False
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        self.server.owner = self
        self.server.daemon_threads = True
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    @property
    def port(self) -> int:
        return int(self.server.server_address[1])

    def start(self) -> None:
        self.thread.start()

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def handle(self, handler: BaseHTTPRequestHandler) -> None:
        length = int(handler.headers.get("Content-Length", "0"))
        body = handler.rfile.read(length) if length else b""
        request = {
            "method": handler.command,
            "path": handler.path,
            "headers": dict(handler.headers.items()),
            "body": body,
        }
        self.requests.append(request)
        if self.response_delay > 0:
            time.sleep(self.response_delay)

        redirect = self.redirects.get(handler.path)
        if redirect is not None:
            status, location = redirect
            redirect_body = f"redirect target {location}; secret {self.token}".encode("utf-8")
            handler.send_response(status)
            handler.send_header("Location", location)
            handler.send_header("Content-Type", "text/plain")
            handler.send_header("Content-Length", str(len(redirect_body)))
            handler.end_headers()
            try:
                handler.wfile.write(redirect_body)
            except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
                pass
            return

        override = self.response_overrides.get(handler.path)
        if override is not None:
            return self.bytes_response(
                handler,
                override.get("status", 200),
                override.get("content_type"),
                override.get("body", b""),
                include_content_length=override.get("include_content_length", True),
                declared_length=override.get("declared_length"),
            )

        if handler.path == "/lokobridge/v1/health":
            return self.json_response(handler, 200, {
                "status": "ok",
                "protocolMajor": 1,
                "protocolMinor": 0,
                "instanceId": self.health_instance_id,
            })
        if handler.headers.get("Authorization") != f"Bearer {self.token}":
            return self.error(handler, 401, "authentication_required", "Authentication failed.", "request-auth")
        if handler.path == "/lokobridge/v1/capabilities":
            return self.json_response(handler, 200, {
                "protocolMajor": 1,
                "protocolMinor": 0,
                "capabilitiesRevision": self.capabilities_revision,
                "capabilities": sorted(self.capabilities),
                "languages": [{"code": "en", "displayName": "English"}],
                "limits": {
                    "maximumTextLength": 20000,
                    "maximumReferenceUploadBytes": 52428800,
                    "supportedAudioMimeTypes": ["audio/wav"],
                    "jobRetentionSeconds": 1800,
                },
            })
        if handler.path == "/lokobridge/v1/presets":
            if self.preset_status != 200:
                return self.error(
                    handler,
                    self.preset_status,
                    "preset_list_failed",
                    f"Sensitive preset failure {self.token}",
                    "request-presets",
                )
            return self.json_response(handler, 200, {"presets": self.presets})
        if handler.command == "POST" and handler.path == "/lokobridge/v1/jobs/speech":
            self._job_reads = 0
            payload = json.loads(body)
            return self.json_response(handler, 202, self.job("queued", payload["requestId"]))
        if handler.command == "GET" and handler.path == "/lokobridge/v1/jobs/job-1":
            post = next(item for item in reversed(self.requests) if item["path"] == "/lokobridge/v1/jobs/speech")
            request_id = json.loads(post["body"])["requestId"]
            state = self.states[min(self._job_reads, len(self.states) - 1)]
            self._job_reads += 1
            return self.json_response(handler, 200, self.job(state, request_id))
        if handler.command == "GET" and handler.path == "/lokobridge/v1/jobs/job-1/audio":
            return self.bytes_response(handler, 200, self.audio_content_type, self.audio)
        if handler.command == "DELETE" and handler.path == "/lokobridge/v1/jobs/job-1":
            self.cancellations += 1
            return self.json_response(handler, 200, {"jobId": "job-1", "accepted": True, "state": "cancelled"})
        self.error(handler, 404, "job_not_found", "Not found.", "request-missing")

    def job(self, state: str, request_id: str) -> dict:
        result = {
            "id": "job-1",
            "requestId": request_id,
            "kind": "speech",
            "state": state,
            "createdAtUtc": "2026-07-22T01:02:04Z",
            "updatedAtUtc": "2026-07-22T01:02:14Z",
            "audioAvailable": state == "completed",
        }
        if state == "failed":
            result["error"] = {
                "code": "model_failed",
                "message": self.failed_message or "Model failed.",
                "retryable": False,
                "diagnosticId": "diag-model",
                "requestId": request_id,
            }
        return result

    def error(self, handler, status: int, code: str, message: str, request_id: str) -> None:
        self.json_response(handler, status, {
            "code": code,
            "message": message,
            "retryable": False,
            "diagnosticId": "diag-http",
            "requestId": request_id,
        })

    @staticmethod
    def json_response(handler, status: int, value: dict) -> None:
        FakeLokoBridgeHost.bytes_response(
            handler,
            status,
            "application/json",
            json.dumps(value, separators=(",", ":")).encode("utf-8"),
        )

    @staticmethod
    def bytes_response(
        handler,
        status: int,
        content_type: str | None,
        body: bytes,
        *,
        include_content_length: bool = True,
        declared_length: int | None = None,
    ) -> None:
        handler.send_response(status)
        if content_type is not None:
            handler.send_header("Content-Type", content_type)
        if include_content_length:
            handler.send_header("Content-Length", str(len(body) if declared_length is None else declared_length))
        handler.end_headers()
        try:
            handler.wfile.write(body)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass


class RequestCollector:
    def __init__(self):
        self.requests: list[dict] = []
        self._closed = False
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        self.server.owner = self
        self.server.daemon_threads = True
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.server.server_address[1]}/collected"

    def start(self) -> None:
        self.thread.start()

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def handle(self, handler: BaseHTTPRequestHandler) -> None:
        self.requests.append({
            "method": handler.command,
            "path": handler.path,
            "headers": dict(handler.headers.items()),
        })
        FakeLokoBridgeHost.bytes_response(handler, 200, "application/json", b"{}")

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *_args):
        self.close()


class MemoryResponse:
    def __init__(self, body: bytes, content_type: str, content_length: str | None):
        self.status = 200
        self.headers = {"Content-Type": content_type}
        if content_length is not None:
            self.headers["Content-Length"] = content_length
        self.body = body
        self.position = 0
        self.read_sizes: list[int] = []

    def read(self, size: int = -1) -> bytes:
        self.read_sizes.append(size)
        if size < 0:
            raise AssertionError("Transport attempted an unrestricted response read.")
        start = self.position
        self.position = min(len(self.body), self.position + size)
        return self.body[start:self.position]

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None


class MemoryOpener:
    def __init__(self, response: MemoryResponse):
        self.response = response

    def open(self, _request, timeout=None):
        return self.response


class BridgeContext:
    def __init__(self, create_discovery: bool = True, protocol_major: int = 1, pid: int | None = None):
        self.temp = tempfile.TemporaryDirectory()
        self.previous_local_app_data = os.environ.get("LOCALAPPDATA")
        os.environ["LOCALAPPDATA"] = self.temp.name
        self.host = FakeLokoBridgeHost()
        self.host.start()
        self.discovery_path = Path(self.temp.name) / "OmniLoko" / "Bridge" / "endpoint-v1.json"
        if create_discovery:
            self.write_discovery(protocol_major=protocol_major, pid=pid)

    def write_discovery(self, protocol_major: int = 1, pid: int | None = None, raw: str | None = None):
        self.discovery_path.parent.mkdir(parents=True, exist_ok=True)
        if raw is not None:
            self.discovery_path.write_text(raw, encoding="utf-8")
            return
        value = {
            "protocolMajor": protocol_major,
            "protocolMinor": 0,
            "capabilitiesRevision": 1,
            "port": self.host.port,
            "pid": pid or os.getpid(),
            "instanceId": self.host.instance_id,
            "bearerToken": self.host.token,
            "startedAtUtc": "2026-07-22T01:02:03Z",
        }
        self.discovery_path.write_text(json.dumps(value), encoding="utf-8")

    def close(self):
        self.host.close()
        if self.previous_local_app_data is None:
            os.environ.pop("LOCALAPPDATA", None)
        else:
            os.environ["LOCALAPPDATA"] = self.previous_local_app_data
        self.temp.cleanup()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.close()


class LokoBridgeNodeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original_modules = {
            name: sys.modules.get(name)
            for name in ("lokobridge_client", "lokobridge_client.models", "torch", "soundfile")
        }
        api, models = fake_client_modules()
        torch, soundfile = fake_audio_modules()
        sys.modules["lokobridge_client"] = api
        sys.modules["lokobridge_client.models"] = models
        sys.modules["torch"] = torch
        sys.modules["soundfile"] = soundfile
        cls.module = load_node_module()
        cls.original_poll = cls.module._POLL_SECONDS
        cls.module._POLL_SECONDS = 0.01

    @classmethod
    def tearDownClass(cls):
        cls.module._POLL_SECONDS = cls.original_poll
        for name, original in cls.original_modules.items():
            if original is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = original

    def setUp(self):
        with self.module._SCHEMA_CACHE_LOCK:
            self.module._SCHEMA_CACHE_EXPIRES_AT = 0.0
            self.module._SCHEMA_CACHE_OPTIONS = (self.module.PROFILE_VOICE,)
            self.module._SCHEMA_CACHE_PRESET_IDS = {self.module.PROFILE_VOICE: None}

    def test_package_and_input_schema_load_without_client_installed(self):
        original_import = builtins.__import__

        def without_client(name, *args, **kwargs):
            if name.startswith("lokobridge_client"):
                raise ImportError("test-only missing client")
            return original_import(name, *args, **kwargs)

        with (
            mock.patch("builtins.__import__", side_effect=without_client),
            mock.patch.object(self.module.importlib, "import_module", side_effect=without_client),
        ):
            package = load_complete_package("novoloko_without_lokobridge_client")
            schema = package.NODE_CLASS_MAPPINGS["NovaOmniLokoTTS"].INPUT_TYPES()

        self.assertEqual([PROFILE_VOICE], schema["required"]["voice"][0])
        self.assertTrue(EXISTING_NODE_IDS.issubset(package.NODE_CLASS_MAPPINGS))

    def test_import_performs_no_bridge_network_request(self):
        with mock.patch("urllib.request.urlopen") as urlopen:
            package = load_complete_package("novoloko_import_without_bridge_probe")
        self.assertIn("NovaOmniLokoTTS", package.NODE_CLASS_MAPPINGS)
        urlopen.assert_not_called()

    def test_duplicate_display_names_have_stable_unique_choices_and_ids(self):
        with BridgeContext() as context:
            context.host.presets = [
                {"id": "opaque-zulu", "displayName": "Same Voice", "format": "pt"},
                {"id": "opaque-alpha", "displayName": "Same Voice", "format": "pt"},
            ]
            first = self.module.NovaOmniLokoTTS.INPUT_TYPES()["required"]["voice"][0]
            first_mapping = dict(self.module._SCHEMA_CACHE_PRESET_IDS)
            with self.module._SCHEMA_CACHE_LOCK:
                self.module._SCHEMA_CACHE_EXPIRES_AT = 0.0
            context.host.presets.reverse()
            second = self.module.NovaOmniLokoTTS.INPUT_TYPES()["required"]["voice"][0]
            second_mapping = dict(self.module._SCHEMA_CACHE_PRESET_IDS)

            self.assertEqual(first, second)
            self.assertEqual(first_mapping, second_mapping)
            duplicate_choices = first[1:]
            self.assertEqual(2, len(duplicate_choices))
            self.assertEqual(2, len(set(duplicate_choices)))
            self.assertTrue(all(choice.startswith("Same Voice · ") for choice in duplicate_choices))
            self.assertEqual({"opaque-alpha", "opaque-zulu"}, {first_mapping[choice] for choice in duplicate_choices})

            resolved = {}
            for choice in duplicate_choices:
                self.module.NovaOmniLokoTTS().speak("duplicate identity", voice=choice)
                post = next(
                    item for item in reversed(context.host.requests) if item["path"].endswith("/jobs/speech")
                )
                resolved[choice] = json.loads(post["body"])["voice"]["presetId"]
            self.assertEqual({choice: first_mapping[choice] for choice in duplicate_choices}, resolved)

    def test_stale_workflow_choice_never_falls_back_to_profile(self):
        with BridgeContext() as context:
            with self.assertRaisesRegex(RuntimeError, "selected OmniLoko preset is no longer available"):
                self.module.NovaOmniLokoTTS().speak("stale choice", voice="Former Voice")
            posts = [item for item in context.host.requests if item["path"].endswith("/jobs/speech")]
            self.assertEqual([], posts)

    def test_deleted_renamed_and_offline_preset_choices_are_rejected(self):
        for replacement in ([], [{"id": "opaque-preset-123", "displayName": "Renamed Voice", "format": "pt"}]):
            with self.subTest(replacement=replacement), BridgeContext() as context:
                choices = self.module.NovaOmniLokoTTS.INPUT_TYPES()["required"]["voice"][0]
                selected = next(choice for choice in choices if choice != PROFILE_VOICE)
                context.host.presets = replacement
                with self.assertRaisesRegex(RuntimeError, "selected OmniLoko preset is no longer available"):
                    self.module.NovaOmniLokoTTS().speak("deleted or renamed", voice=selected)
                self.assertFalse(any(item["path"].endswith("/jobs/speech") for item in context.host.requests))

        with BridgeContext() as context:
            choices = self.module.NovaOmniLokoTTS.INPUT_TYPES()["required"]["voice"][0]
            selected = next(choice for choice in choices if choice != PROFILE_VOICE)
            context.host.close()
            with self.assertRaisesRegex(RuntimeError, "selected OmniLoko preset is no longer available"):
                self.module.NovaOmniLokoTTS().speak("offline preset", voice=selected)

    def test_schema_discovery_is_bounded_cached_and_contains_no_secrets(self):
        with BridgeContext(create_discovery=False) as missing:
            started = time.monotonic()
            self.assertEqual([PROFILE_VOICE], self.module.NovaOmniLokoTTS.INPUT_TYPES()["required"]["voice"][0])
            self.assertLess(time.monotonic() - started, 0.75)
            self.assertEqual([], missing.host.requests)

        self.setUp()
        with BridgeContext() as stale:
            started = time.monotonic()
            with mock.patch.object(self.module, "_process_is_running", return_value=False):
                self.assertEqual([PROFILE_VOICE], self.module.NovaOmniLokoTTS.INPUT_TYPES()["required"]["voice"][0])
            self.assertLess(time.monotonic() - started, 0.75)
            self.assertEqual([], stale.host.requests)

        self.setUp()
        with BridgeContext() as unresponsive:
            unresponsive.host.response_delay = 2.0
            started = time.monotonic()
            choices = self.module.NovaOmniLokoTTS.INPUT_TYPES()["required"]["voice"][0]
            first_elapsed = time.monotonic() - started
            request_count = len(unresponsive.host.requests)

            started = time.monotonic()
            cached_choices = self.module.NovaOmniLokoTTS.INPUT_TYPES()["required"]["voice"][0]
            cached_elapsed = time.monotonic() - started

            self.assertEqual([PROFILE_VOICE], choices)
            self.assertEqual(choices, cached_choices)
            self.assertLess(first_elapsed, 2.5)
            self.assertLess(cached_elapsed, 0.5)
            self.assertEqual(request_count, len(unresponsive.host.requests))
            cache_text = repr((self.module._SCHEMA_CACHE_OPTIONS, self.module._SCHEMA_CACHE_PRESET_IDS))
            self.assertNotIn(unresponsive.host.token, cache_text)
            self.assertNotIn(str(unresponsive.discovery_path), cache_text)
            self.assertTrue(all(isinstance(label, str) for label in self.module._SCHEMA_CACHE_OPTIONS))
            self.assertTrue(
                all(isinstance(label, str) and (preset_id is None or isinstance(preset_id, str))
                    for label, preset_id in self.module._SCHEMA_CACHE_PRESET_IDS.items())
            )

    def test_concurrent_schema_requests_share_one_sanitized_probe(self):
        with BridgeContext() as context:
            context.host.presets.append({
                "id": context.host.token,
                "displayName": context.host.token,
                "format": "pt",
            })
            context.host.presets.append({
                "id": "..\\private\\voice.pt",
                "displayName": "..\\private\\voice.pt",
                "format": "pt",
            })
            with ThreadPoolExecutor(max_workers=6) as executor:
                results = list(executor.map(lambda _index: self.module.NovaOmniLokoTTS.INPUT_TYPES(), range(6)))

            choices = [result["required"]["voice"][0] for result in results]
            self.assertTrue(all(choice == choices[0] for choice in choices))
            self.assertEqual([PROFILE_VOICE, "Test Voice"], choices[0])
            self.assertEqual(1, sum(item["path"].endswith("/health") for item in context.host.requests))
            self.assertEqual(1, sum(item["path"].endswith("/capabilities") for item in context.host.requests))
            self.assertEqual(1, sum(item["path"].endswith("/presets") for item in context.host.requests))
            cache_text = repr((self.module._SCHEMA_CACHE_OPTIONS, self.module._SCHEMA_CACHE_PRESET_IDS))
            self.assertNotIn(context.host.token, cache_text)
            self.assertNotIn("..\\private", cache_text)

    def test_public_ci_configuration_has_no_private_lokobridge_credentials(self):
        workflow_text = "\n".join(
            path.read_text(encoding="utf-8")
            for path in (ROOT / ".github" / "workflows").iterdir()
            if path.suffix.lower() in {".yml", ".yaml"}
        )
        core_requirements = (ROOT / "requirements.txt").read_text(encoding="utf-8").splitlines()
        requirements_text = "\n".join(
            path.read_text(encoding="utf-8") for path in ROOT.glob("requirements*.txt")
        )
        expected_pin = 'lokobridge-client==1.0.0; python_version >= "3.11"'
        self.assertEqual(1, core_requirements.count(expected_pin))
        self.assertIn("python -m pip install -r requirements.txt", workflow_text)
        self.assertNotIn("LOKOBRIDGE_DEPLOY_KEY", workflow_text)
        self.assertNotIn("NovoLokoLabs/LokoBridge", workflow_text)
        self.assertNotIn("git+", requirements_text)
        self.assertNotIn(".whl", requirements_text)
        self.assertNotIn("NovoLokoLabs/LokoBridge", requirements_text)
        self.assertNotIn("LOKOBRIDGE_DEPLOY_KEY", requirements_text)
        self.assertFalse(any(ROOT.rglob("lokobridge_client-*.whl")))

    def test_all_existing_mappings_and_new_mapping_load(self):
        package = load_complete_package("novoloko_complete_mapping_test")
        self.assertEqual(
            EXISTING_NODE_IDS | {"NovaOmniLokoTTS", "NovaVoiceEngineTTS"},
            set(package.NODE_CLASS_MAPPINGS),
        )
        self.assertEqual("NovoLoko OmniLoko TTS", package.NODE_DISPLAY_NAME_MAPPINGS["NovaOmniLokoTTS"])

    def test_missing_discovery_is_actionable(self):
        with BridgeContext(create_discovery=False):
            with self.assertRaisesRegex(RuntimeError, "Start OmniLoko normally or with --bridge-only"):
                self.module.NovaOmniLokoTTS().speak("hello")

    def test_malformed_discovery_is_rejected_and_unchanged(self):
        with BridgeContext(create_discovery=False) as context:
            context.write_discovery(raw="{ malformed discovery")
            before = context.discovery_path.read_bytes()
            with self.assertRaisesRegex(RuntimeError, "discovery information is invalid"):
                self.module.NovaOmniLokoTTS().speak("hello")
            self.assertEqual(before, context.discovery_path.read_bytes())

    def test_stale_pid_is_rejected_without_touching_discovery(self):
        with BridgeContext() as context:
            before = context.discovery_path.read_bytes()
            with mock.patch.object(self.module, "_process_is_running", return_value=False):
                with self.assertRaisesRegex(RuntimeError, "OmniLoko is unavailable"):
                    self.module.NovaOmniLokoTTS().speak("hello")
            self.assertEqual(before, context.discovery_path.read_bytes())

    def test_non_literal_ipv4_loopback_endpoint_is_rejected(self):
        for endpoint in (
            "http://localhost:1234/lokobridge/v1/",
            "http://0.0.0.0:1234/lokobridge/v1/",
            "http://192.168.1.2:1234/lokobridge/v1/",
            "http://[::1]:1234/lokobridge/v1/",
        ):
            with self.subTest(endpoint=endpoint), self.assertRaises(RuntimeError):
                self.module._validate_endpoint(endpoint)

    def test_health_instance_mismatch_is_rejected(self):
        with BridgeContext() as context:
            context.host.health_instance_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
            with self.assertRaisesRegex(RuntimeError, "invalid LokoBridge response"):
                self.module.NovaOmniLokoTTS().speak("hello")

    def test_unsupported_protocol_and_capabilities_are_rejected(self):
        with BridgeContext(protocol_major=2):
            with self.assertRaisesRegex(RuntimeError, "discovery information is invalid"):
                self.module.NovaOmniLokoTTS().speak("hello")
        with BridgeContext() as context:
            context.host.capabilities.discard("audio.wav@1")
            with self.assertRaisesRegex(RuntimeError, "invalid LokoBridge response"):
                self.module.NovaOmniLokoTTS().speak("hello")

    def test_redirects_never_reach_their_target_or_leak_authentication(self):
        for status in (301, 302, 303, 307, 308):
            with self.subTest(status=status), RequestCollector() as collector, BridgeContext() as context:
                redirect_destination = f"{collector.url}?secret={context.host.token}"
                context.host.redirects["/lokobridge/v1/capabilities"] = (status, redirect_destination)
                captured_out = io.StringIO()
                captured_err = io.StringIO()
                with contextlib.redirect_stdout(captured_out), contextlib.redirect_stderr(captured_err):
                    with self.assertRaisesRegex(RuntimeError, "invalid LokoBridge response") as raised:
                        self.module.NovaOmniLokoTTS().speak("redirect safely")

                visible = str(raised.exception) + captured_out.getvalue() + captured_err.getvalue()
                self.assertEqual([], collector.requests)
                self.assertNotIn(context.host.token, visible)
                self.assertNotIn(collector.url, visible)

    def test_successful_response_reads_are_bounded_without_unrestricted_allocation(self):
        allowed_base = "http://127.0.0.1:43210/lokobridge/v1/"
        audio_url = allowed_base + "jobs/job-1/audio"
        oversized_audio = MemoryResponse(b"body must not be read", "audio/wav", "17")
        with (
            mock.patch.object(self.module, "_MAX_AUDIO_BYTES", 16),
            mock.patch.object(
                self.module.urllib.request,
                "build_opener",
                return_value=MemoryOpener(oversized_audio),
            ),
        ):
            transport = self.module._deadline_transport(allowed_base_url=allowed_base)
            with self.assertRaisesRegex(RuntimeError, "permitted size"):
                transport("GET", audio_url, {"Authorization": "Bearer hidden"}, None, 1.0)
        self.assertEqual([], oversized_audio.read_sizes)

        for content_length in (None, "0"):
            with self.subTest(content_length=content_length):
                streamed_json = MemoryResponse(b"raw-sensitive-body" * 8, "application/json", content_length)
                with (
                    mock.patch.object(self.module, "_MAX_JSON_BYTES", 16),
                    mock.patch.object(
                        self.module.urllib.request,
                        "build_opener",
                        return_value=MemoryOpener(streamed_json),
                    ),
                ):
                    transport = self.module._deadline_transport(allowed_base_url=allowed_base)
                    with self.assertRaisesRegex(RuntimeError, "permitted size") as raised:
                        transport("GET", allowed_base + "capabilities", {"Authorization": "Bearer hidden"}, None, 1.0)
                self.assertEqual(17, sum(streamed_json.read_sizes))
                self.assertNotIn("raw-sensitive-body", str(raised.exception))
                self.assertNotIn("hidden", str(raised.exception))

    def test_oversized_json_and_structured_error_responses_fail_safely(self):
        raw_marker = "raw-response-must-not-escape"
        with mock.patch.object(self.module, "_MAX_JSON_BYTES", 512):
            with BridgeContext() as context:
                context.host.response_overrides["/lokobridge/v1/capabilities"] = {
                    "status": 200,
                    "content_type": "application/json",
                    "body": (raw_marker + context.host.token).encode("utf-8") * 8,
                }
                with self.assertRaisesRegex(RuntimeError, "invalid LokoBridge response") as raised:
                    self.module.NovaOmniLokoTTS().speak("oversized metadata")
                self.assertNotIn(raw_marker, str(raised.exception))
                self.assertNotIn(context.host.token, str(raised.exception))

            with BridgeContext() as context:
                context.host.response_overrides["/lokobridge/v1/jobs/speech"] = {
                    "status": 500,
                    "content_type": "application/json",
                    "body": (raw_marker + context.host.token).encode("utf-8") * 8,
                    "include_content_length": False,
                }
                with self.assertRaisesRegex(RuntimeError, "invalid LokoBridge response") as raised:
                    self.module.NovaOmniLokoTTS().speak("oversized structured error")
                self.assertNotIn(raw_marker, str(raised.exception))
                self.assertNotIn(context.host.token, str(raised.exception))
                self.assertTrue(any(item["path"].endswith("/jobs/speech") for item in context.host.requests))

    def test_audio_requires_wav_content_type_before_riff_decoding(self):
        self.module._require_wav_content_type({"content-type": "audio/wav; charset=binary"})
        for content_type in ("text/plain", "application/json", None):
            with self.subTest(content_type=content_type), BridgeContext() as context:
                context.host.audio_content_type = content_type
                with self.assertRaisesRegex(RuntimeError, "invalid LokoBridge response"):
                    self.module.NovaOmniLokoTTS().speak("wrong audio metadata")
                self.assertTrue(any(item["path"].endswith("/audio") for item in context.host.requests))

    def test_current_profile_request_shape_and_audio_conversion(self):
        with BridgeContext() as context:
            before = context.discovery_path.read_bytes()
            audio, spoken, status, voice_used = self.module.NovaOmniLokoTTS().speak(
                "hello bridge",
                normalize_loudness=False,
            )
            post = next(item for item in context.host.requests if item["path"].endswith("/jobs/speech"))
            request = json.loads(post["body"])
            self.assertEqual("NovoLoko", request["clientName"])
            self.assertEqual("3.5.0", request["clientVersion"])
            self.assertEqual({"kind": "profile-current"}, request["voice"])
            self.assertFalse(request["normalizeLoudness"])
            self.assertEqual("hello bridge", spoken)
            self.assertEqual(PROFILE_VOICE, voice_used)
            self.assertIn("LokoBridge v1", status)
            self.assertEqual(24_000, audio["sample_rate"])
            self.assertEqual((1, 1, 480), tuple(audio["waveform"].shape))
            self.assertEqual(before, context.discovery_path.read_bytes())

    def test_opaque_preset_request_shape(self):
        with BridgeContext() as context:
            choices = self.module.NovaOmniLokoTTS.INPUT_TYPES()["required"]["voice"][0]
            selected = next(item for item in choices if item != PROFILE_VOICE)
            result = self.module.NovaOmniLokoTTS().speak("preset speech", voice=selected)
            post = next(item for item in reversed(context.host.requests) if item["path"].endswith("/jobs/speech"))
            request = json.loads(post["body"])
            self.assertEqual({"kind": "preset", "presetId": "opaque-preset-123"}, request["voice"])
            self.assertEqual("Test Voice", result[3])
            self.assertNotIn(".pt", json.dumps(request), "Preset requests must use only opaque IDs.")

    def test_queued_loading_running_poll_to_completed(self):
        with BridgeContext() as context:
            context.host.states = ["loading", "running", "completed"]
            result = self.module.NovaOmniLokoTTS().speak("poll states")
            job_reads = [item for item in context.host.requests if item["path"] == "/lokobridge/v1/jobs/job-1"]
            self.assertEqual(3, len(job_reads))
            self.assertEqual(24_000, result[0]["sample_rate"])

    def test_empty_and_malformed_wav_are_rejected(self):
        for payload, message in ((b"", "empty WAV"), (b"not a wave", "malformed WAV")):
            with self.subTest(message=message), BridgeContext() as context:
                context.host.audio = payload
                with self.assertRaisesRegex(RuntimeError, message):
                    self.module.NovaOmniLokoTTS().speak("bad audio")

    def test_structured_failure_is_redacted_and_includes_identifiers(self):
        with BridgeContext() as context:
            context.host.states = ["failed"]
            context.host.failed_message = f"Hostile secret: {context.host.token}"
            captured_out = io.StringIO()
            captured_err = io.StringIO()
            with contextlib.redirect_stdout(captured_out), contextlib.redirect_stderr(captured_err):
                with self.assertRaises(RuntimeError) as raised:
                    self.module.NovaOmniLokoTTS().speak("fail safely")
            message = str(raised.exception)
            self.assertIn("code: model_failed", message)
            self.assertIn("diagnostic: diag-model", message)
            self.assertIn("request:", message)
            self.assertNotIn(context.host.token, message)
            self.assertNotIn(context.host.token, captured_out.getvalue() + captured_err.getvalue())

    def test_timeout_after_acceptance_sends_delete(self):
        with BridgeContext() as context:
            context.host.states = ["running"]
            with self.assertRaisesRegex(RuntimeError, "bridge_timeout"):
                self.module.NovaOmniLokoTTS().speak("timeout", timeout_seconds=1)
            self.assertEqual(1, context.host.cancellations)

    def test_comfy_interruption_after_acceptance_sends_delete(self):
        with BridgeContext() as context:
            calls = 0

            def interrupt_after_acceptance():
                nonlocal calls
                calls += 1
                if calls >= 2:
                    raise InterruptedError("ComfyUI interrupted")

            with mock.patch.object(self.module, "_raise_if_interrupted", side_effect=interrupt_after_acceptance):
                with self.assertRaises(InterruptedError):
                    self.module.NovaOmniLokoTTS().speak("interrupt")
            self.assertEqual(1, context.host.cancellations)

    def test_accepted_jobs_have_no_kokoro_or_worker_fallback_path(self):
        source = (ROOT / "lokobridge_nodes.py").read_text(encoding="utf-8")
        self.assertNotIn("NovaKokoroTTS", source)
        self.assertNotIn("omnivoice_worker.py", source)
        self.assertNotIn("subprocess", source)
        self.assertNotIn("Popen", source)
        self.assertNotIn("CreateProcess", source)

    def test_preset_failure_keeps_profile_current_available(self):
        with BridgeContext() as context:
            context.host.preset_status = 500
            choices = self.module.NovaOmniLokoTTS.INPUT_TYPES()["required"]["voice"][0]
            self.assertEqual([PROFILE_VOICE], choices)
            result = self.module.NovaOmniLokoTTS().speak("profile still works")
            self.assertEqual(PROFILE_VOICE, result[3])
            visible = " ".join([*choices, result[2], result[3]])
            self.assertNotIn(context.host.token, visible)

    def test_disabled_and_empty_text_return_silence_without_bridge(self):
        with BridgeContext() as context:
            disabled = self.module.NovaOmniLokoTTS().speak("ignored", enabled=False)
            empty = self.module.NovaOmniLokoTTS().speak("  ")
            self.assertEqual((1, 1, 6000), tuple(disabled[0]["waveform"].shape))
            self.assertEqual((1, 1, 6000), tuple(empty[0]["waveform"].shape))
            self.assertIn("disabled", disabled[2])
            self.assertIn("No text", empty[2])
            self.assertEqual([], context.host.requests)

    def test_output_contract_exactly_matches_kokoro_tts(self):
        voice_nodes = importlib.import_module(f"{PACKAGE_NAME}.voice_nodes")
        node = self.module.NovaOmniLokoTTS
        self.assertEqual(voice_nodes.NovaKokoroTTS.RETURN_TYPES, node.RETURN_TYPES)
        self.assertEqual(voice_nodes.NovaKokoroTTS.RETURN_NAMES, node.RETURN_NAMES)
        self.assertTrue(node.OUTPUT_NODE)


if __name__ == "__main__":
    unittest.main()
