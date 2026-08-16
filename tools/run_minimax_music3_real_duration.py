"""Queue one real MiniMax Music 3 duration proof against an isolated ComfyUI."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request
import uuid


def request_json(url: str, payload: dict | None = None) -> dict:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="GET" if data is None else "POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def duration_seconds(path: Path) -> float:
    completed = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True,
        text=True,
        timeout=120,
        check=True,
    )
    return float(completed.stdout.strip())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", default="http://127.0.0.1:8614")
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--requested-seconds", type=float, default=300.0)
    parser.add_argument("--seed", type=int, default=464500)
    parser.add_argument("--timeout", type=float, default=3600.0)
    args = parser.parse_args()

    caption = (
        "Global Metadata: cinematic alternative rock at 104 BPM, determined and expansive, designed as a five-minute song.\n\n"
        "Vocal Details: powerful female lead, intimate verses, layered harmonies and a large sustained final chorus.\n\n"
        "Arrangement: atmospheric guitar intro, three substantial verses, two pre-choruses, repeated evolving choruses, "
        "instrumental guitar interlude, bridge, breakdown, extended final chorus and long resolved outro. Leave breathing room between sections."
    )
    lyrics = """[Intro]\nInstrumental atmosphere, eight bars\n\n[Verse 1]\nI found the morning waiting on the other side\nA quiet street, an open door, no place to hide\nI carried every broken promise through the rain\nThen learned the weight I held was never mine to claim\n\n[Pre-Chorus]\nLet the old walls fall behind me\nLet the daylight find me\n\n[Chorus]\nI am still here, I am still rising\nEvery scar becomes a line of silver lighting\nI am still here, the horizon open wide\nI found my name and brought it back to life\n\n[Instrumental]\nGuitar motif, eight bars\n\n[Verse 2]\nThe city turns beneath a slowly changing sky\nI hear the trains and know that I can choose the line\nNo borrowed voice will tell me who I have to be\nI built a room inside my heart and kept the key\n\n[Pre-Chorus]\nLet the old walls fall behind me\nLet the daylight find me\n\n[Chorus]\nI am still here, I am still rising\nEvery scar becomes a line of silver lighting\nI am still here, the horizon open wide\nI found my name and brought it back to life\n\n[Instrumental Break]\nExtended guitar and drums, sixteen bars\n\n[Verse 3]\nIf shadows call, I know the road that leads me home\nThe strongest roots are often grown through broken stone\nI do not need the past to vanish or forgive\nI only need this breath, this room, this chance to live\n\n[Bridge]\nHold the silence, hear it turning\nAll the distant windows burning\nI was never meant to disappear\nOpen every door, the future starts right here\n\n[Breakdown]\nStill here, still rising\nStill here, still rising\n\n[Final Chorus]\nI am still here, I am still rising\nEvery scar becomes a line of silver lighting\nI am still here, the horizon open wide\nI found my name and brought it back to life\nI am still here, I am still rising\nEvery breath becomes a new horizon\n\n[Outro]\nExtended vocal harmonies and instrumental resolution, sixteen bars\nStill here\nStill rising\nStill alive"""

    prompt = {
        "1": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": "minimax_music3_text_encoder_pruned_int8_convrot.safetensors", "type": "minimax", "device": "default"}},
        "2": {"class_type": "MiniMaxMusic3TextEncode", "inputs": {
            "clip": ["1", 0], "caption": caption, "lyrics": lyrics, "seed": args.seed,
            "max_duration": args.requested_seconds, "cfg_scale": 1.7, "top_k": 50}},
        "3": {"class_type": "UNETLoader", "inputs": {
            "unet_name": "minimax_music3_dit_fp16.safetensors", "weight_dtype": "default"}},
        "4": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["2", 0]}},
        "5": {"class_type": "EmptyMiniMaxMusic3LatentAudio", "inputs": {"seconds": ["2", 1], "batch_size": 1}},
        "6": {"class_type": "KSampler", "inputs": {
            "model": ["3", 0], "seed": args.seed, "steps": 30, "cfg": 1.7,
            "sampler_name": "euler", "scheduler": "simple", "positive": ["2", 0],
            "negative": ["4", 0], "latent_image": ["5", 0], "denoise": 1.0}},
        "7": {"class_type": "VAELoader", "inputs": {"vae_name": "minimax_music3_dav.safetensors"}},
        "8": {"class_type": "VAEDecodeAudioTiled", "inputs": {
            "samples": ["6", 0], "vae": ["7", 0], "tile_size": 1536, "overlap": 64}},
        "9": {"class_type": "SaveAudio", "inputs": {
            "audio": ["8", 0], "filename_prefix": "duration-proof-v4.6.4/MiniMaxMusic3_5min_request"}},
    }
    report = {
        "schema": "novoloko.music3.real-duration-proof.v1",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "server": args.server,
        "seed": args.seed,
        "requested_max_duration_seconds": args.requested_seconds,
        "model_files": {
            "dit": "minimax_music3_dit_fp16.safetensors",
            "text_encoder": "minimax_music3_text_encoder_pruned_int8_convrot.safetensors",
            "dav": "minimax_music3_dav.safetensors",
        },
        "generation": {"steps": 30, "cfg": 1.7, "sampler": "euler", "scheduler": "simple"},
        "prompt": prompt,
        "status": "submitting",
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)

    try:
        queued = request_json(f"{args.server}/prompt", {"prompt": prompt, "client_id": str(uuid.uuid4())})
        prompt_id = queued["prompt_id"]
        report["prompt_id"] = prompt_id
        report["status"] = "queued"
        args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Queued real 300-second request as {prompt_id}", flush=True)
        started = time.perf_counter()
        last_message = started
        history_item = None
        while time.perf_counter() - started < args.timeout:
            history = request_json(f"{args.server}/history/{prompt_id}")
            if prompt_id in history:
                history_item = history[prompt_id]
                break
            now = time.perf_counter()
            if now - last_message >= 30:
                queue = request_json(f"{args.server}/queue")
                print(f"Still generating: {now - started:.1f}s elapsed; queue_running={len(queue.get('queue_running', []))}", flush=True)
                last_message = now
            time.sleep(2)
        if history_item is None:
            raise TimeoutError(f"No history result after {args.timeout:.0f}s")
        elapsed = round(time.perf_counter() - started, 3)
        report["wall_seconds"] = elapsed
        report["history_status"] = history_item.get("status", {})
        if history_item.get("status", {}).get("status_str") != "success":
            raise RuntimeError(f"ComfyUI generation failed: {history_item.get('status')}")
        audio_items = history_item.get("outputs", {}).get("9", {}).get("audio", [])
        if not audio_items:
            raise RuntimeError(f"SaveAudio returned no audio item: {history_item.get('outputs', {}).get('9')}")
        item = audio_items[0]
        audio_path = args.output_root / item.get("subfolder", "") / item["filename"]
        actual = duration_seconds(audio_path)
        report.update({
            "status": "success",
            "saved_audio": str(audio_path),
            "actual_audio_duration_seconds": round(actual, 6),
            "finished_early_seconds": round(max(0.0, args.requested_seconds - actual), 6),
            "model_finished_early": actual + 0.5 < args.requested_seconds,
        })
        print(json.dumps({key: report[key] for key in (
            "requested_max_duration_seconds", "actual_audio_duration_seconds", "finished_early_seconds",
            "model_finished_early", "wall_seconds", "saved_audio")}, indent=2), flush=True)
    except Exception as error:
        report["status"] = "failed"
        report["error"] = f"{type(error).__name__}: {error}"
        print(report["error"], flush=True)
    finally:
        args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Wrote {args.report.resolve()}", flush=True)
    return 0 if report["status"] == "success" else 1


if __name__ == "__main__":
    raise SystemExit(main())
