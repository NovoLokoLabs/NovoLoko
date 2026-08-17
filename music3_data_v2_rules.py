"""Small curation rules layered onto Music Data v2.

Keeping these explicit exceptions separate makes ambiguous style names and
artist-trait boundaries reviewable instead of burying special cases inside the
larger compatibility engine.
"""

from __future__ import annotations

from functools import lru_cache

from . import music3_data_v2 as v2


_ORIGINAL_BROAD_GENRE_FOR = v2.broad_genre_for
_ORIGINAL_CURATED_DNA = v2._curated_dna

# Names containing "pop" are not necessarily Pop.  Handle the handful of
# established rock-family labels before the broad heuristic sees that token.
ROCK_EXACT = {
    "britpop",
    "post-rock",
    "math rock",
    "gothic rock",
    "noise rock",
    "industrial rock",
    "classic rock",
    "glam rock",
    "garage rock",
    "psychedelic rock",
    "southern rock",
    "alternative rock",
    "indie rock",
    "progressive rock",
    "hard rock",
    "shoegaze",
    "grunge",
    "post-punk",
    "darkwave",
    "emo",
}


def broad_genre_for(value):
    text = v2.m3._clean_text(value)
    if text.casefold() in ROCK_EXACT:
        return "Rock"
    return _ORIGINAL_BROAD_GENRE_FOR(value)


@lru_cache(maxsize=1)
def curated_dna():
    profiles = {
        key: dict(value)
        for key, value in _ORIGINAL_CURATED_DNA().items()
    }

    # Keep Missy's scene identity separate from the instrument/drum trait so a
    # manual instrument override really removes the drum/palette DNA instead of
    # leaving the same instruction duplicated under "scene".
    missy = profiles.get("missy elliott")
    if missy:
        missy["scene"] = (
            "Late-1990s to 2000s futuristic hip-hop and R&B crossover with playful sound design, "
            "bold rhythmic invention, forward-looking club energy, and unconventional song-form instincts."
        )
        missy["instruments"] = (
            "Unconventional drum programming, deep elastic bass, sparse synth or sample motifs, vocal chops, "
            "percussive effects, and intentionally weird electronic accents rather than generic boom-bap loops."
        )
    return profiles


v2.broad_genre_for = broad_genre_for
v2._curated_dna = curated_dna
v2._style_parent_map.cache_clear()
v2._builtins_cache.cache_clear()
