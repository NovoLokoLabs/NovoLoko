"""Create a separate Ollama/GGUF writer A/B copy of the v4.6 Music Lab."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "workflows" / "NovoLoko MiniMax Music 3 - Lab v4.6.0.json"
DESTINATION = ROOT / "workflows" / "NovoLoko MiniMax Music 3 - Writer A-B v4.6.1.json"


def _input(name: str, value_type: str) -> dict:
    return {
        "label": name,
        "localized_name": name,
        "name": name,
        "type": value_type,
        "widget": {"name": name},
        "link": None,
    }


def build(source: Path = SOURCE, destination: Path = DESTINATION) -> Path:
    workflow = json.loads(source.read_text(encoding="utf-8"))
    writer = next(
        node
        for node in workflow["nodes"]
        if node["type"] == "CLIPLoader" and "text writer" in node.get("title", "").lower()
    )
    links = list(writer["outputs"][0].get("links") or [])
    writer.update(
        {
            "type": "NovaMusicWriterOllamaLoader",
            "size": [520, 180],
            "inputs": [
                _input("model", "STRING"),
                _input("keep_alive", "COMBO"),
                _input("context_length", "INT"),
                _input("timeout_seconds", "INT"),
            ],
            "outputs": [
                {
                    "label": "writer",
                    "localized_name": "writer",
                    "name": "writer",
                    "type": "CLIP",
                    "links": links,
                },
                {
                    "label": "load_status",
                    "localized_name": "load_status",
                    "name": "load_status",
                    "type": "STRING",
                    "links": None,
                },
            ],
            "title": "TEXT WRITER A-B - TYPE FAST / BALANCED / GEMMA ALIAS",
            "properties": {
                "Node name for S&R": "NovaMusicWriterOllamaLoader",
                "ver": "4.6.1",
                "novolokoWriterBenchmarkAliases": [
                    "novoloko-music-fast",
                    "novoloko-music-balanced",
                    "novoloko-music-gemma",
                ],
            },
            "widgets_values": ["novoloko-music-fast", "30m", 8192, 600],
        }
    )
    workflow.setdefault("extra", {})["novolokoMusicLabVersion"] = "4.6.1"
    workflow["extra"]["novolokoWriterBenchmark"] = {
        "schema": "novoloko.music3.writer-benchmark.v1",
        "thinking": False,
        "seed": 424242,
        "instructions": "Change only the writer alias; keep IDEA, seed and all 3 writer Thinking toggles unchanged.",
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(workflow, indent=2, ensure_ascii=False), encoding="utf-8")
    return destination


if __name__ == "__main__":
    print(build())
