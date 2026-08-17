"""Additional practical style depth for Music Data v2.

Kept separate from the core compatibility engine so the editorial taxonomy can
be expanded or trimmed without touching node serialization or resolution code.
"""

from __future__ import annotations

import csv
from functools import lru_cache
from pathlib import Path

from . import music3_data_v2 as v2
from . import music3_data_v2_rules as rules


DEPTH_PATH = Path(__file__).with_name("csv") / "music3" / "25_styles_depth_v2.csv"
_ORIGINAL_STYLE_ROWS = v2._style_overlay_rows
_ORIGINAL_BROAD_GENRE = rules.broad_genre_for


@lru_cache(maxsize=1)
def style_overlay_rows():
    rows = list(_ORIGINAL_STYLE_ROWS())
    known = {row.get("name", "") for row in rows}
    if DEPTH_PATH.is_file():
        with DEPTH_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
            for source in csv.DictReader(handle):
                row = {
                    str(key or "").strip(): v2.m3._clean_text(value)
                    for key, value in source.items()
                }
                if row.get("name") and row.get("prompt") and row["name"] not in known:
                    rows.append(row)
                    known.add(row["name"])
    return tuple(rows)


def broad_genre_for(value):
    text = v2.m3._clean_text(value).casefold()
    if "new age" in text or "meditation" in text:
        return "Ambient"
    return _ORIGINAL_BROAD_GENRE(value)


# New Age / Meditation is a useful style family but not a peer top-level Genre
# beside Ambient. Removing it is the exact kind of cleanup Music Data v2 exists
# to do: fewer understandable parents, richer children.
v2.BROAD_GENRES.pop("New Age / Meditation", None)
v2._style_overlay_rows = style_overlay_rows
v2.broad_genre_for = broad_genre_for
rules.broad_genre_for = broad_genre_for
v2._style_parent_map.cache_clear()
v2._builtins_cache.cache_clear()
