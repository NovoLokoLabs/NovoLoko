"""Additional practical style and artist depth for Music Data v2.

Kept separate from the core compatibility engine so the editorial taxonomy and
high-value artist-neutral DNA can be expanded or trimmed without touching node
serialization or resolution code.
"""

from __future__ import annotations

import csv
from functools import lru_cache
from pathlib import Path
from typing import Any
import unicodedata

from . import music3_data_v2 as v2
from . import music3_data_v2_rules as rules


STYLE_DEPTH_PATH = Path(__file__).with_name("csv") / "music3" / "25_styles_depth_v2.csv"
ARTIST_DEPTH_PATH = Path(__file__).with_name("csv") / "music3" / "26_artist_dna_depth_v2.csv"
_ORIGINAL_STYLE_ROWS = v2._style_overlay_rows
_ORIGINAL_BROAD_GENRE = rules.broad_genre_for
_ORIGINAL_CURATED_DNA = v2._curated_dna
_ORIGINAL_STYLE_PARENT_MAP = v2._style_parent_map


def _clear_cache(function: Any) -> None:
    clear = getattr(function, "cache_clear", None)
    if callable(clear):
        clear()


def _reference_alias(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return text.casefold().strip()


@lru_cache(maxsize=1)
def style_overlay_rows():
    rows = list(_ORIGINAL_STYLE_ROWS())
    known = {row.get("name", "") for row in rows}
    if STYLE_DEPTH_PATH.is_file():
        with STYLE_DEPTH_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
            for source in csv.DictReader(handle):
                row = {
                    str(key or "").strip(): v2.m3._clean_text(value)
                    for key, value in source.items()
                }
                if row.get("name") and row.get("prompt") and row["name"] not in known:
                    rows.append(row)
                    known.add(row["name"])
    return tuple(rows)


@lru_cache(maxsize=1)
def curated_dna():
    profiles = {
        key: dict(value)
        for key, value in _ORIGINAL_CURATED_DNA().items()
    }
    # Also expose accent-insensitive lookup aliases. The legacy reference CSV
    # contains a few plain-ASCII names (for example Beyonce) while editorial DNA
    # may use the correctly accented display spelling. Search labels stay as-is;
    # only internal lookup is normalized.
    for key, value in list(profiles.items()):
        profiles.setdefault(_reference_alias(key), dict(value))

    if ARTIST_DEPTH_PATH.is_file():
        with ARTIST_DEPTH_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
            for source in csv.DictReader(handle):
                row = {
                    str(key or "").strip(): v2.m3._clean_text(value)
                    for key, value in source.items()
                }
                reference = row.get("reference", "")
                if not reference:
                    continue
                traits = {
                    key: row.get(key, "")
                    for key in v2.DNA_TRAIT_KEYS
                    if row.get(key, "")
                }
                if not traits:
                    continue
                profiles[reference.casefold()] = traits
                profiles[_reference_alias(reference)] = dict(traits)
    return profiles


def broad_genre_for(value):
    text = v2.m3._clean_text(value).casefold()
    # Explicit legacy compatibility before the looser substring heuristics.
    if "reggaeton" in text or text.startswith("latin ") or text.startswith("latin/"):
        return "Latin / Reggaeton"
    if "new age" in text or "meditation" in text:
        return "Ambient"
    if text.startswith("britpop") or text.startswith("brit pop"):
        return "Rock"
    return _ORIGINAL_BROAD_GENRE(value)


@lru_cache(maxsize=1)
def style_parent_map():
    # Start with the compatibility/heuristic map, then let explicit editorial
    # rows win unconditionally. In v1 an explicit Experimental parent could be
    # second-guessed because Experimental was also the heuristic fallback. That
    # is exactly how "Gregorian Drill Opera" leaked back into Hip-Hop.
    result = dict(_ORIGINAL_STYLE_PARENT_MAP())
    for row in style_overlay_rows():
        name = v2.m3._clean_text(row.get("name"))
        parent = v2.m3._clean_text(row.get("parent_genre"))
        if name and parent:
            result[name] = broad_genre_for(parent)

    # A few legacy labels predate the parent column. Their human meaning is
    # clearer than substring heuristics and should remain stable.
    legacy_exact = {
        "Britpop Swagger": "Rock",
        "90s Arena Alternative": "Rock",
        "Opera Rock": "Rock",
        "Gothic Post-Punk": "Rock",
        "Pop Punk": "Punk",
        "Gregorian Drill Opera": "Experimental",
        "Genre Roulette Mutation": "Experimental",
    }
    result.update(legacy_exact)
    return result


# New Age / Meditation is a useful style family but not a peer top-level Genre
# beside Ambient. Removing it is the exact kind of cleanup Music Data v2 exists
# to do: fewer understandable parents, richer children.
v2.BROAD_GENRES.pop("New Age / Meditation", None)
v2._style_overlay_rows = style_overlay_rows
v2._curated_dna = curated_dna
v2.broad_genre_for = broad_genre_for
v2._style_parent_map = style_parent_map
rules.broad_genre_for = broad_genre_for
_clear_cache(_ORIGINAL_STYLE_PARENT_MAP)
_clear_cache(v2._builtins_cache)
_clear_cache(v2.m3.load_music_presets)
