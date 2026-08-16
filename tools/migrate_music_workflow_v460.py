"""Migrate a NovoLoko MiniMax Music 3 v4.5.1 workflow to unified v4.6.0."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


VERSION = "4.6.0"


def _input(name: str, value_type: str, link: int | None = None, *, widget: bool = False, shape: int | None = None) -> dict[str, Any]:
    item: dict[str, Any] = {"label": name, "localized_name": name, "name": name, "type": value_type, "link": link}
    if widget:
        item["widget"] = {"name": name}
    if shape is not None:
        item["shape"] = shape
    return item


def _output(name: str, value_type: str) -> dict[str, Any]:
    return {"label": name, "localized_name": name, "name": name, "type": value_type, "links": []}


def _rebuild_links(workflow: dict[str, Any]) -> None:
    nodes = {node["id"]: node for node in workflow["nodes"]}
    occupied: set[tuple[int, int]] = set()
    for node in nodes.values():
        for item in node.get("inputs") or []:
            item["link"] = None
        for item in node.get("outputs") or []:
            item["links"] = []
    for link in workflow.get("links") or []:
        link_id, source_id, source_slot, target_id, target_slot, _value_type = link
        if source_id not in nodes or target_id not in nodes:
            raise ValueError(f"Link {link_id} references a missing node.")
        source = nodes[source_id]
        target = nodes[target_id]
        if source_slot >= len(source.get("outputs") or []) or target_slot >= len(target.get("inputs") or []):
            raise ValueError(f"Link {link_id} references an undefined slot.")
        endpoint = (target_id, target_slot)
        if endpoint in occupied:
            raise ValueError(f"Multiple links target {target_id}:{target_slot}.")
        occupied.add(endpoint)
        source["outputs"][source_slot]["links"].append(link_id)
        target["inputs"][target_slot]["link"] = link_id


def migrate(workflow: dict[str, Any]) -> dict[str, Any]:
    nodes = {node["id"]: node for node in workflow.get("nodes") or []}
    controls = next((node for node in nodes.values() if node.get("type") == "NovaMusicControls"), None)
    saver = next((node for node in nodes.values() if node.get("type") == "NovaMusicSaveAudioMetadata"), None)
    if controls is None or saver is None:
        raise ValueError("The workflow needs NovoLoko Music Controls and Save Audio nodes.")

    idea_node = next((node for node in nodes.values() if node.get("type") == "NovaMusicIdea"), None)
    idea = ""
    if idea_node is not None:
        idea = str((idea_node.get("widgets_values") or [""])[0] or "")

    control_inputs = controls.setdefault("inputs", [])
    if not any(item.get("name") == "idea" for item in control_inputs):
        control_inputs.append(_input("idea", "STRING", widget=True, shape=7))
        controls.setdefault("widgets_values", []).append(idea)
    control_outputs = controls.setdefault("outputs", [])
    expected_outputs = [
        ("music_style_brief", "STRING"), ("lyric_direction", "STRING"),
        ("section_plan", "STRING"), ("selected_options", "STRING"),
        ("duration_seconds", "FLOAT"), ("seed_used", "INT"),
        ("music_idea", "STRING"), ("controls_recipe_json", "STRING"),
    ]
    while len(control_outputs) < len(expected_outputs):
        name, value_type = expected_outputs[len(control_outputs)]
        control_outputs.append(_output(name, value_type))
    controls.update({
        "title": "1 - IDEA + CSV CONTROLS / RANDOMIZE / BATCH REPORT",
        "pos": [-1600, -180],
        "size": [620, 760],
    })
    controls.setdefault("properties", {}).update({"ver": VERSION, "novaMusicControlsUI": VERSION})
    controls["properties"].pop("novaMusicControlsPanelHeight", None)

    if idea_node is not None:
        for link in workflow.get("links") or []:
            if link[1] == idea_node["id"] and link[2] == 0:
                link[1], link[2] = controls["id"], 6
        workflow["nodes"] = [node for node in workflow["nodes"] if node["id"] != idea_node["id"]]

    saver_inputs = saver.setdefault("inputs", [])
    recipe_index = next((index for index, item in enumerate(saver_inputs) if item.get("name") == "controls_recipe_json"), None)
    if recipe_index is None:
        recipe_index = next((index for index, item in enumerate(saver_inputs) if item.get("widget")), len(saver_inputs))
        saver_inputs.insert(recipe_index, _input("controls_recipe_json", "STRING", shape=7))
        for link in workflow.get("links") or []:
            if link[3] == saver["id"] and link[4] >= recipe_index:
                link[4] += 1
        next_link = max([int(workflow.get("last_link_id", 0)), *(int(link[0]) for link in workflow.get("links") or [])]) + 1
        workflow.setdefault("links", []).append([next_link, controls["id"], 7, saver["id"], recipe_index, "STRING"])
        workflow["last_link_id"] = next_link

    titles = {
        "NovaMusicLyricEnhancer": "2A - LYRIC IDEA ENHANCER",
        "NovaMusicLyricsGenerator": "2B - STRUCTURED LYRICS GENERATOR",
        "NovaMusicCaptionEnhancer": "2C - MUSIC-ONLY CAPTION ENHANCER",
        "NovaMusicSaveAudioMetadata": "4 - NOVOLOKO SAVE AUDIO + PROMPT METADATA",
        "NovaMusicAudioLibrary": "5 - NOVOLOKO AUDIO LIBRARY / PLAYER + VISUALIZER",
    }
    for node in workflow["nodes"]:
        if node.get("type") in titles:
            node["title"] = titles[node["type"]]
        if node.get("type") in {"NovaMusicLyricEnhancer", "NovaMusicLyricsGenerator", "NovaMusicCaptionEnhancer"}:
            node.setdefault("properties", {}).update({"novaMusicWriterThinkingDefault": False, "ver": VERSION})
        if node.get("type") == "NovaMemoryManager":
            node["widgets_values"] = ["Fast Batch / Reuse", False, False, False, False]
            node.setdefault("properties", {})["ver"] = VERSION
        if node.get("id") == 10:
            node["title"] = "3 - CURRENT COMFYUI MINIMAX MUSIC 3 GENERATOR"

    for group in workflow.get("groups") or []:
        if group.get("id") == 1:
            group.update({"title": "1 - UNIFIED IDEA + CSV CONTROLS", "bounding": [-1660, -260, 660, 920]})

    _rebuild_links(workflow)
    workflow["revision"] = int(workflow.get("revision", 0)) + 1
    workflow.setdefault("extra", {})["novolokoMusicLabVersion"] = VERSION
    return workflow


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("workflow", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    source = args.workflow.resolve()
    destination = args.output.resolve() if args.output else source.with_name(f"{source.stem} - migrated v4.6.0.json")
    document = json.loads(source.read_text(encoding="utf-8"))
    destination.write_text(json.dumps(migrate(document), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(destination)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
