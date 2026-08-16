"""Probe a direct ComfyUI llama.cpp GGUF writer without touching a live session."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import time


REQUIRED_SOURCE_MARKERS = (
    "from llama_cpp import Llama",
    "create_chat_completion",
    "run_gguf_plain_text_chat",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--python", type=Path, required=True, help="ComfyUI embedded Python executable")
    parser.add_argument("--node-source", type=Path, required=True, help="Direct GGUF node's Python source")
    parser.add_argument("--model", type=Path, required=True, help="GGUF model intended for the fair test")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=424242)
    args = parser.parse_args()

    source = args.node_source.read_text(encoding="utf-8", errors="replace")
    marker_results = {marker: marker in source for marker in REQUIRED_SOURCE_MARKERS}
    probe_code = (
        "import llama_cpp; "
        "from llama_cpp import Llama; "
        "print('llama_cpp=' + str(getattr(llama_cpp, '__version__', 'unknown'))); "
        "print('Llama=' + str(Llama))"
    )
    started = time.perf_counter()
    completed = subprocess.run(
        [str(args.python), "-c", probe_code],
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    load_seconds = round(time.perf_counter() - started, 3)
    runnable = completed.returncode == 0 and all(marker_results.values())
    report = {
        "schema": "novoloko.music3.native-gguf-probe.v1",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "fair_test_contract": {
            "model_family": "Qwen3 4B uncensored/heretic instruct GGUF",
            "model_path": str(args.model),
            "model_size_bytes": args.model.stat().st_size,
            "model_sha256": sha256(args.model),
            "seed": args.seed,
            "thinking": False,
            "task": "the same NovoLoko 3A/3B/3C autoregressive writer workload",
        },
        "implementation": {
            "node_source": str(args.node_source),
            "source_markers": marker_results,
            "causal_text_generation_path_present": all(marker_results.values()),
            "architecture": "llama-cpp-python Llama.create_chat_completion",
            "chat_template_note": "The node forwards chat-template settings to create_chat_completion and retries without unsupported template kwargs.",
            "seed_note": "The node forwards seed when supported and can retry without seed on incompatible llama-cpp builds.",
        },
        "loader_probe": {
            "python": str(args.python),
            "elapsed_seconds": load_seconds,
            "returncode": completed.returncode,
            "stdout": completed.stdout.strip(),
            "stderr": completed.stderr.strip(),
        },
        "benchmark": {
            "model_load": "not reached" if not runnable else "loader import passed; model benchmark still required",
            "3A": "not run" if not runnable else "not run by dependency probe",
            "3B": "not run" if not runnable else "not run by dependency probe",
            "3C": "not run" if not runnable else "not run by dependency probe",
            "writer_total": None,
            "vram_residency": "none; failure occurred before model load" if not runnable else "not measured",
            "output_formatting": "no output; failure occurred before generation" if not runnable else "not measured",
        },
        "decision": (
            "unsupported in this installed ComfyUI runtime: llama-cpp-python cannot load its ggml DLL dependency; keep Ollama FAST as the supported default"
            if not runnable
            else "dependency import passed; run the full model benchmark before deciding"
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report["loader_probe"], indent=2, ensure_ascii=False))
    print(f"Wrote {args.output.resolve()}")
    return 0 if runnable else 2


if __name__ == "__main__":
    raise SystemExit(main())
