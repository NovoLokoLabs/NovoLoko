"""Run a clean idea through the selected real writer with Uncensored enabled."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from music3_nodes import (  # noqa: E402
    CUSTOM_PRESET,
    NovaMusicCaptionEnhancer,
    NovaMusicControls,
    NovaMusicLyricEnhancer,
    NovaMusicLyricsGenerator,
    NovaMusicWriterBackendSelector,
    NovaMusicWriterOllamaLoader,
    _contains_explicit_language,
)


PROFANITY = re.compile(r"\b(?:fuck(?:ing|ed)?|shit|bitch(?:es)?|damn|asshole|motherfucker)\b", re.I)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default="novoloko-music-fast")
    parser.add_argument("--seed", type=int, default=464464)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    idea = "A fictional adult breakup song about rebuilding confidence after a dishonest relationship."

    controls = NovaMusicControls().build(
        preset=CUSTOM_PRESET,
        seed=args.seed,
        idea=idea,
        genre="Alternative Rock",
        mood="Angry",
        vocal_delivery="Gritty Rock Shout",
        vocal_gender_type="Female Lead",
        explicitness="Uncensored",
        song_length="About 4 Minutes",
    )
    music_brief, lyric_direction, section_plan, selection_report = controls[:4]
    writer, load_status = NovaMusicWriterOllamaLoader().load_writer(args.model, "30m", 8192, 600)
    selected, backend_status = NovaMusicWriterBackendSelector().select_writer(
        NovaMusicWriterBackendSelector.OLLAMA,
        ollama_writer=writer,
    )
    try:
        stage_3a = NovaMusicLyricEnhancer().enhance(
            selected,
            idea=idea,
            lyric_direction=lyric_direction,
            creativity=0.85,
            max_length=2048,
            seed=args.seed,
            thinking=False,
            use_default_template=True,
        )
        stage_3b = NovaMusicLyricsGenerator().generate_lyrics(
            selected,
            lyric_brief=stage_3a[0],
            section_plan=section_plan,
            creativity=0.90,
            max_length=4096,
            seed=args.seed,
            thinking=False,
            use_default_template=True,
        )
        stage_3c = NovaMusicCaptionEnhancer().enhance_caption(
            selected,
            idea=idea,
            music_style_brief=music_brief,
            creativity=0.70,
            max_length=2048,
            seed=args.seed,
            thinking=False,
            use_default_template=True,
        )
    finally:
        writer.unload()

    final_lyrics = stage_3b[0]
    matches = PROFANITY.findall(final_lyrics)
    report = {
        "schema": "novoloko.music3.explicitness-proof.v1",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "backend": backend_status,
        "load_status": load_status,
        "model": args.model,
        "seed": args.seed,
        "thinking": False,
        "clean_idea": idea,
        "idea_contains_profanity": bool(PROFANITY.search(idea)),
        "selection_report": selection_report,
        "resolved_lyric_direction": lyric_direction,
        "stage_status": {"3A": stage_3a[2], "3B": stage_3b[2], "3C": stage_3c[2]},
        "instructions": {"3A": stage_3a[1], "3B": stage_3b[1], "3C": stage_3c[1]},
        "outputs": {"3A": stage_3a[0], "3B_final_lyrics": final_lyrics, "3C": stage_3c[0]},
        "proof": {
            "resolved_prompt_requires_clean_idea_override": "even when the short idea contains no profanity" in lyric_direction,
            "final_lyrics_contains_explicit_language": _contains_explicit_language(final_lyrics),
            "matched_profanity_count": len(matches),
            "matched_profanity": matches,
            "fictional_content_boundary_present": "real-world instructions" in stage_3b[1],
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report["proof"], indent=2, ensure_ascii=False))
    print(f"Wrote {args.output.resolve()}")
    return 0 if all((
        not report["idea_contains_profanity"],
        report["proof"]["resolved_prompt_requires_clean_idea_override"],
        report["proof"]["final_lyrics_contains_explicit_language"],
        report["proof"]["matched_profanity_count"] >= 2,
        report["proof"]["fictional_content_boundary_present"],
    )) else 1


if __name__ == "__main__":
    raise SystemExit(main())
