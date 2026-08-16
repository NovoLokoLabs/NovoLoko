"""A/B local NovoLoko writer models with the real 3A/3B/3C node prompts."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys
import time


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from music3_nodes import (  # noqa: E402
    NovaMusicCaptionEnhancer,
    NovaMusicLyricEnhancer,
    NovaMusicLyricsGenerator,
    NovaMusicWriterOllamaLoader,
)


DEFAULT_MODELS = [
    "novoloko-music-fast",
    "novoloko-music-balanced",
    "novoloko-music-gemma",
]
DEFAULT_IDEA = "A dark, cinematic rap song about rebuilding after betrayal, with a huge memorable hook."
LYRIC_DIRECTION = (
    "Modern dark hip-hop; first-person survivor perspective; dense multisyllabic rhymes; vivid but fictional "
    "street imagery; strong emotional progression; concise ad-libs; explicit language allowed; no censorship."
)
SECTION_PLAN = "[Intro] -> [Verse 1] -> [Pre-Chorus] -> [Chorus] -> [Verse 2] -> [Bridge] -> [Final Chorus] -> [Outro]"
MUSIC_STYLE_BRIEF = (
    "Global Metadata: modern cinematic hip-hop at 142 BPM, dark-to-triumphant mood.\n\n"
    "Vocal Details: deep aggressive lead rap, controlled grit, layered chant hook, sparse ad-libs.\n\n"
    "Arrangement: ominous piano intro, heavy 808 and brass verses, widening hook, stripped bridge, final impact ending."
)


def elapsed_call(function, *args, **kwargs):
    started = time.perf_counter()
    result = function(*args, **kwargs)
    return result, time.perf_counter() - started


def command_snapshot(command: list[str]) -> dict[str, object]:
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=20, check=False)
        return {
            "command": command,
            "returncode": completed.returncode,
            "stdout": completed.stdout.strip(),
            "stderr": completed.stderr.strip(),
        }
    except Exception as error:
        return {"command": command, "error": f"{type(error).__name__}: {error}"}


def quality_checks(brief: str, lyrics: str, caption: str) -> dict[str, object]:
    tags = ["[Verse 1]", "[Chorus]", "[Outro]"]
    headings = ["Global Metadata:", "Vocal Details:", "Arrangement:"]
    return {
        "brief_characters": len(brief),
        "lyrics_characters": len(lyrics),
        "caption_characters": len(caption),
        "lyrics_required_tags_present": {tag: tag.lower() in lyrics.lower() for tag in tags},
        "caption_required_headings_present": {heading: heading.lower() in caption.lower() for heading in headings},
        "lyrics_has_markdown_fence": "```" in lyrics,
        "caption_has_lyric_tags": any(tag.lower() in caption.lower() for tag in tags),
    }


def benchmark_model(model: str, idea: str, seed: int, quick: bool) -> dict[str, object]:
    for node_type in (NovaMusicLyricEnhancer, NovaMusicLyricsGenerator, NovaMusicCaptionEnhancer):
        node_type._cache.clear()
    limits = (768, 1536, 768) if quick else (2048, 4096, 2048)
    loader = NovaMusicWriterOllamaLoader()
    (writer, load_status), load_seconds = elapsed_call(loader.load_writer, model, "30m", 8192, 600)

    try:
        lyric_result, lyric_seconds = elapsed_call(
            NovaMusicLyricEnhancer().enhance,
            writer,
            idea=idea,
            lyric_direction=LYRIC_DIRECTION,
            creativity=0.85,
            max_length=limits[0],
            seed=seed,
            thinking=False,
            use_default_template=True,
        )
        lyrics_result, lyrics_seconds = elapsed_call(
            NovaMusicLyricsGenerator().generate_lyrics,
            writer,
            lyric_brief=lyric_result[0],
            section_plan=SECTION_PLAN,
            creativity=0.90,
            max_length=limits[1],
            seed=seed,
            thinking=False,
            use_default_template=True,
        )
        caption_result, caption_seconds = elapsed_call(
            NovaMusicCaptionEnhancer().enhance_caption,
            writer,
            idea=idea,
            music_style_brief=MUSIC_STYLE_BRIEF,
            creativity=0.70,
            max_length=limits[2],
            seed=seed,
            thinking=False,
            use_default_template=True,
        )
        residency = {
            "ollama_ps": command_snapshot(["ollama", "ps"]),
            "nvidia_smi": command_snapshot([
                "nvidia-smi", "--query-gpu=name,memory.total,memory.used,memory.free",
                "--format=csv,noheader,nounits",
            ]),
        }
        result = {
        "model": model,
        "thinking": False,
        "seed": seed,
        "limits": {"3A": limits[0], "3B": limits[1], "3C": limits[2]},
        "timings_seconds": {
            "model_load": round(load_seconds, 3),
            "3A_lyric_enhancer": round(lyric_seconds, 3),
            "3B_lyrics_generator": round(lyrics_seconds, 3),
            "3C_caption_enhancer": round(caption_seconds, 3),
            "writer_total": round(load_seconds + lyric_seconds + lyrics_seconds + caption_seconds, 3),
        },
        "status": {
            "load": load_status,
            "3A": lyric_result[2],
            "3B": lyrics_result[2],
            "3C": caption_result[2],
        },
        "quality_checks": quality_checks(lyric_result[0], lyrics_result[0], caption_result[0]),
        "residency": residency,
        "outputs": {
            "3A_lyric_brief": lyric_result[0],
            "3B_lyrics": lyrics_result[0],
            "3C_music_caption": caption_result[0],
        },
        }
    finally:
        # Only one writer occupies the 3090 at a time.  This does not unload or
        # restart anything in the active ComfyUI session.
        writer.unload()
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models", nargs="+", default=DEFAULT_MODELS)
    parser.add_argument("--idea", default=DEFAULT_IDEA)
    parser.add_argument("--seed", type=int, default=424242)
    parser.add_argument("--quick", action="store_true", help="Use shorter output caps for a fast first pass.")
    parser.add_argument("--output", type=Path, default=Path("writer-benchmark-report.json"))
    args = parser.parse_args()

    report = {
        "schema": "novoloko.music3.writer-benchmark.v1",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "idea": args.idea,
        "seed": args.seed,
        "thinking": False,
        "mode": "quick" if args.quick else "production-length",
        "models": [],
    }
    for model in args.models:
        print(f"Benchmarking {model}...", flush=True)
        try:
            report["models"].append(benchmark_model(model, args.idea, args.seed, args.quick))
        except Exception as error:  # Continue so one optional wildcard cannot erase the useful comparison.
            report["models"].append({"model": model, "error": str(error)})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {args.output.resolve()}")
    return 0 if all("error" not in item for item in report["models"]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
