from __future__ import annotations

import importlib
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = "novoloko_style_preview_tests"


def load_package_module(name: str):
    package = sys.modules.get(PACKAGE)
    if package is None:
        package = types.ModuleType(PACKAGE)
        package.__path__ = [str(ROOT)]
        sys.modules[PACKAGE] = package
    return importlib.import_module(f"{PACKAGE}.{name}")


def load_population_tool():
    name = f"{PACKAGE}.populate_style_previews"
    spec = importlib.util.spec_from_file_location(
        name,
        ROOT / "tools/populate_style_previews.py",
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class StylePreviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.previews = load_package_module("style_previews")
        cls.nodes = load_package_module("nodes")

    def test_preview_keys_are_portable_opaque_and_paths_reject_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "ComfyUI-NovoLoko"
            library = root / "styles" / "my_styles.yaml"
            library.parent.mkdir(parents=True)
            library.write_text("styles: []", encoding="utf-8")

            first = self.previews.library_key(library, root)
            same_elsewhere = self.previews.library_key(
                Path(temp) / "copy" / "ComfyUI-NovoLoko" / "styles" / "my_styles.yaml",
                Path(temp) / "copy" / "ComfyUI-NovoLoko",
            )
            style = self.previews.style_key("0001 | Anime Style")

            self.assertEqual(first, same_elsewhere)
            self.assertRegex(first, r"^[0-9a-f]{24}$")
            self.assertRegex(style, r"^[0-9a-f]{32}$")
            self.assertNotIn(str(root), first)
            with self.assertRaises(ValueError):
                self.previews.safe_preview_path(root, "../escape", style)

    def test_preview_resize_is_exact_and_atomic(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            for size in (512, 1024):
                with self.subTest(size=size):
                    source = io.BytesIO()
                    Image.new("RGB", (900, 500), (180, 20, 40)).save(source, "PNG")
                    source.seek(0)
                    destination = Path(temp) / f"preview-{size}.webp"

                    self.previews.resize_and_store_preview(source, destination, size)

                    with Image.open(destination) as result:
                        self.assertEqual((size, size), result.size)
                        self.assertEqual("WEBP", result.format)
            self.assertEqual([], list(destination.parent.glob(".preview-*")))

    def test_payload_contains_only_opaque_preview_url(self) -> None:
        styles = [{
            "name": "0001 | Anime Style",
            "prompt": "anime illustration",
            "negative": "photo",
            "category": "Anime",
            "favorite": False,
        }]
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "ComfyUI-NovoLoko"
            library = root / "styles" / "styles.yaml"
            library.parent.mkdir(parents=True)
            library.write_text("styles: []", encoding="utf-8")
            destination = self.previews.preview_path(root, library, styles[0]["name"])
            destination.parent.mkdir(parents=True)
            destination.write_bytes(b"preview")

            with (
                mock.patch.object(self.nodes, "_node_dir", return_value=str(root)),
                mock.patch.object(self.nodes, "_read_styles", return_value=styles),
                mock.patch.object(self.nodes, "_load_favorites", return_value=[]),
                mock.patch.object(self.nodes, "_resolve_csv_path", return_value=str(library)),
            ):
                payload = self.nodes._style_browser_payload(str(library))

            preview_url = payload["items"][0]["preview_url"]
            self.assertRegex(
                preview_url,
                r"^/nova_style_previews/image/[0-9a-f]{24}/[0-9a-f]{32}\?v=\d+$",
            )
            self.assertNotIn(str(root), json.dumps(payload))

    def test_batch_name_mode_populates_512_preview(self) -> None:
        tool = load_population_tool()
        with tempfile.TemporaryDirectory() as temp:
            temp_root = Path(temp)
            package = temp_root / "ComfyUI-NovoLoko"
            package.mkdir()
            images = temp_root / "images"
            images.mkdir()
            Image.new("RGB", (640, 480), (10, 120, 220)).save(images / "Anime Style.png")
            library = temp_root / "styles.csv"
            library.write_text(
                "name,category,prompt,negative_prompt\n"
                "0001 | Anime Style,Anime,anime illustration,photo\n",
                encoding="utf-8",
            )

            with mock.patch.object(tool, "ROOT", package):
                result = tool.populate(images, str(library), 512, "name", True)

            self.assertEqual(1, result["matched_count"])
            self.assertEqual(1, result["imported_count"])
            previews = list((package / "data/style_previews").rglob("*.webp"))
            self.assertEqual(1, len(previews))
            with Image.open(previews[0]) as image:
                self.assertEqual((512, 512), image.size)

    def test_order_mode_skips_none_and_random_control_rows(self) -> None:
        tool = load_population_tool()
        records = [
            {"name": "none"},
            {"name": "artist | random"},
            {"name": "0001 | Anime Style"},
            {"name": "0002 | Oil Painting"},
        ]
        images = [Path("0001.png"), Path("0002.png")]
        matches, unmatched = tool.build_order_matches(records, images)
        self.assertEqual(["0001 | Anime Style", "0002 | Oil Painting"], [
            record["name"] for record, _ in matches
        ])
        self.assertEqual([], unmatched)

    def test_frontend_is_standalone_prompt_stack_aware_and_image_enabled(self) -> None:
        browser = (ROOT / "web/nova_style_dropdown.js").read_text(encoding="utf-8")
        stack = (ROOT / "web/nova_prompt_stack_aio.js").read_text(encoding="utf-8")

        for marker in (
            "nova-style-standalone-launcher",
            "NovoLoko Standalone Style Browser",
            "/nova_style_previews/upload",
            "/nova_style_previews/delete",
            "for (const size of [512, 1024])",
            "preview_url",
            "object-fit:contain",
            "Generate + save preview",
            "queueCurrentWorkflow",
            "api.queuePrompt(0, prompt)",
            "/history/${encodeURIComponent(promptId)}",
            "finalGeneratedImage",
            "/view?${params}",
            "uploadPreview(item, state.csv, state.previewSize, file)",
            "View larger",
            "nova-style-preview-viewer",
            "Actual size",
            "Fit to window",
            "image.naturalWidth",
            "Generate all missing",
            "fetchWholeLibrary",
            "missing.length.toLocaleString()",
            "Existing previews will not be replaced",
            "■ Stop generating",
            "LAUNCHER_POSITION_KEY",
            "setPointerCapture",
            "Click to open. Drag to move.",
            "node?.widgets?.find",
        ):
            self.assertIn(marker, browser)
        self.assertNotIn("object-fit:cover", browser)
        for marker in (
            "Browse Medium styles visually",
            "window.NovoLokoStyleBrowser",
            'csv: String(file?.value || "styles/novoloko_all_yaml_styles.yaml")',
            "onSelect(item)",
        ):
            self.assertIn(marker, stack)

    def test_frontend_has_persistent_generation_and_viewer_convenience_controls(self) -> None:
        browser = (ROOT / "web/nova_style_dropdown.js").read_text(encoding="utf-8")

        for marker in (
            "↻ Refresh",
            'cache: "no-store"',
            "previewBatchSession",
            "requestPreviewStop",
            "await api.interrupt()",
            "Open preview after a single generated style",
            "Wrap Previous/Next at the ends",
            "Right-click closes the large viewer",
            "event.button === 3",
            "event.button === 4",
            'stage.addEventListener("wheel"',
            "Math.min(8, Math.max(0.1",
            'viewer.addEventListener("contextmenu"',
            "card.ondblclick",
            "void applyAndGenerate(item)",
            "z-index:5",
        ):
            self.assertIn(marker, browser)

    def test_generated_preview_state_is_ignored(self) -> None:
        ignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("data/style_previews/", ignore)
        tracked = subprocess.run(
            ["git", "ls-files", "data/style_previews"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        self.assertEqual("", tracked.stdout.strip())

    def test_release_keeps_runtime_batch_tool_but_excludes_generated_previews(self) -> None:
        workflow = (ROOT / ".github/workflows/release.yml").read_text(encoding="utf-8")
        self.assertIn("tools/populate_style_previews.py", workflow)
        self.assertIn("dist/stage/ComfyUI-NovoLoko/tools/", workflow)
        self.assertIn("--exclude 'tools/'", workflow)
        self.assertNotIn("data/style_previews", workflow)


if __name__ == "__main__":
    unittest.main()
