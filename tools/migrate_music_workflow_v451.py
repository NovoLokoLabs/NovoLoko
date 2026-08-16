"""Compatibility-safe MiniMax Music 3 workflow migration for v4.5.1."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def _replace_versions(value):
    if isinstance(value, str):
        return value.replace("v4.5.0", "v4.5.1").replace("4.5.0", "4.5.1")
    if isinstance(value, list):
        return [_replace_versions(item) for item in value]
    if isinstance(value, dict):
        return {key: _replace_versions(item) for key, item in value.items()}
    return value


def migrate(source: Path, destination: Path) -> None:
    workflow = json.loads(source.read_text(encoding="utf-8"))
    workflow = _replace_versions(workflow)
    for node in workflow.get("nodes", []):
        node_type = node.get("type")
        widgets = node.setdefault("widgets_values", [])
        properties = node.setdefault("properties", {})
        if node_type == "NovaMusicControls":
            if len(widgets) in {43, 45} and len(widgets) > 3 and widgets[3] in {
                "fixed", "increment", "decrement", "randomize",
            }:
                widgets.pop(3)
            if len(widgets) == 42:
                widgets.extend(["Off", ""])
            elif len(widgets) >= 44:
                widgets[42:44] = [widgets[42] or "Off", widgets[43] or ""]
            if not isinstance(node.get("size"), list) or float(node["size"][1]) > 1800:
                node["size"] = [620, 760]
            properties["novaMusicControlsUI"] = "4.5.1"
            properties["novaMusicControlsPanelHeight"] = 590
        elif node_type == "NovaMusicSaveAudioMetadata":
            if len(widgets) == 6:
                widgets.append("WAV (24-bit)")
        elif node_type == "NovaMusicAudioLibrary":
            properties.setdefault("novaMusicKaraokeFollow", False)
            properties.setdefault("novaMusicKaraokeOffset", 0)
            properties["novaMusicPlayerPanelHeight"] = max(
                300, min(1710, int(float(node.get("size", [720, 820])[1])) - 90)
            )
    workflow.setdefault("extra", {})["novolokoMusicLabVersion"] = "4.5.1"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(workflow, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    migrate(args.source, args.destination)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
