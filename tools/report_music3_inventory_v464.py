"""Produce the locked v4.6.3 -> v4.6.4 Music 3 inventory report."""

from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import music3_nodes as music3  # noqa: E402


BASELINE_COUNTS = {
    "genre": 45, "subgenre_era": 148, "mood": 40, "vocal_delivery": 58,
    "vocal_gender_type": 39, "instruments": 92, "production_style": 73,
    "bpm_tempo": 32, "song_structure": 33, "hook_style": 34, "themes": 52,
    "explicitness": 12, "aggression": 14, "darkness": 15, "rhyme_density": 14,
    "wordplay": 17, "storytelling": 18, "adlibs": 15, "song_length": 14,
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    catalog = music3.load_music_catalog()
    payload = music3._music_controls_api_payload()
    visible = [item for item in payload["presets"] if not item.get("hidden")]
    artist_rows = [item for item in visible if item.get("reference")]
    family_artists: dict[str, set[str]] = defaultdict(set)
    family_variants: dict[str, int] = defaultdict(int)
    for item in artist_rows:
        folder = str(item.get("folder") or "Unfoldered").removeprefix("Artist References / ")
        family_artists[folder].add(str(item["reference"]))
        family_variants[folder] += 1
    final_counts = {key: len(rows) for key, rows in catalog.items()}
    report = {
        "schema": "novoloko.music3.inventory.v4.6.4",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "baseline": "audited v4.6.3",
        "control_counts": {
            key: {"v4.6.3": BASELINE_COUNTS[key], "v4.6.4": final_counts[key], "added": final_counts[key] - BASELINE_COUNTS[key]}
            for key in music3.CATEGORY_SPECS
        },
        "totals": {
            "control_categories": len(catalog),
            "built_in_choices": sum(final_counts.values()),
            "visible_presets": len(visible),
            "backend_preset_records": len(payload["presets"]),
            "named_artists": len({item["reference"] for item in artist_rows}),
            "clone_like_artist_variants": len(artist_rows),
            "genre_values": final_counts["genre"],
            "style_era_values": final_counts["subgenre_era"],
            "new_named_artists": len({item["reference"] for item in artist_rows}) - 102,
            "new_visible_artist_variants": len(artist_rows) - 204,
            "new_genre_style_values": final_counts["genre"] + final_counts["subgenre_era"] - 45 - 148,
            "new_useful_reference_entries": (len(artist_rows) - 204) + (final_counts["genre"] + final_counts["subgenre_era"] - 45 - 148),
        },
        "artist_reference_families": {
            folder: {"named_artists": len(family_artists[folder]), "visible_clone_like_variants": family_variants[folder]}
            for folder in sorted(family_artists)
        },
    }
    expected = report["totals"]
    assert expected["named_artists"] == 377
    assert expected["clone_like_artist_variants"] == 754
    assert expected["built_in_choices"] == 1429
    assert expected["visible_presets"] == 820
    assert expected["new_useful_reference_entries"] >= 500
    assert all(value["v4.6.4"] > value["v4.6.3"] for value in report["control_counts"].values())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report["totals"], indent=2, ensure_ascii=False))
    print(f"Wrote {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
