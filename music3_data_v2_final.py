"""Final UI/transparency alignment for NovoLoko Music Data v2.

Reference presets now use independent artist-neutral DNA. This module makes the
remaining visible preset metadata tell the same story as generation: sensible
broad Genre, neutral generic controls, and a clear explanation that manual
controls act as overrides rather than pretending to be the artist profile.
"""

from __future__ import annotations

import copy
from functools import lru_cache
from typing import Any, Mapping

from . import music3_data_v2 as v2
from . import music3_data_v2_rules as rules


_NEUTRAL_LOAD_BUILTINS = v2.m3._load_builtin_music_presets
_V2_PRESET_API_ROWS = v2.m3._preset_api_rows
_V2_CONTROLS_API = v2.m3._music_controls_api_payload

# Only cases where the legacy/reference-row broad genre is misleading. Most
# references keep their existing broad family so random-preset Genre filters and
# search remain intuitive.
REFERENCE_GENRE_OVERRIDES = {
    "måneskin": "Rock",
    "counting crows": "Rock",
    "nirvana": "Rock",
    "pearl jam": "Rock",
    "alice in chains": "Rock",
    "soundgarden": "Rock",
    "foo fighters": "Rock",
    "radiohead": "Rock",
    "the cure": "Rock",
    "depeche mode": "Electronic",
    "u2": "Rock",
    "oasis": "Rock",
    "arctic monkeys": "Rock",
    "muse": "Rock",
    "queen": "Rock",
    "fleetwood mac": "Rock",
    "led zeppelin": "Rock",
    "pink floyd": "Rock",
    "ac/dc": "Rock",
    "guns n' roses": "Rock",
    "paramore": "Punk",
    "the cranberries": "Rock",
    "no doubt": "Rock",
    "garbage": "Rock",
    "hole": "Rock",
    "evanescence": "Rock",
    "florence + the machine": "Rock",
    "wolf alice": "Rock",
    "the smashing pumpkins": "Rock",
    "nine inch nails": "Rock",
    "metallica": "Metal",
    "iron maiden": "Metal",
    "black sabbath": "Metal",
    "linkin park": "Metal",
    "slipknot": "Metal",
    "bring me the horizon": "Metal",
    "green day": "Punk",
    "blink-182": "Punk",
    "my chemical romance": "Rock",
    "missy elliott": "Hip-Hop / Rap",
    "kendrick lamar": "Hip-Hop / Rap",
    "eminem": "Hip-Hop / Rap",
    "dr. dre": "Hip-Hop / Rap",
    "outkast": "Hip-Hop / Rap",
    "lauryn hill": "R&B / Soul",
    "beyonce": "R&B / Soul",
    "beyoncé": "R&B / Soul",
    "rihanna": "Pop",
    "sza": "R&B / Soul",
    "billie eilish": "Pop",
    "lady gaga": "Pop",
    "dua lipa": "Pop",
    "chappell roan": "Pop",
    "olivia rodrigo": "Pop",
    "blackpink": "Pop",
    "newjeans": "Pop",
    "twice": "Pop",
    "michael jackson": "Pop",
    "madonna": "Pop",
    "prince": "Funk",
    "adele": "R&B / Soul",
    "whitney houston": "R&B / Soul",
    "amy winehouse": "R&B / Soul",
    "the weeknd": "R&B / Soul",
    "taylor swift": "Pop",
    "bruno mars": "Pop",
    "sade": "R&B / Soul",
}


def _clear_cache(function: Any) -> None:
    clear = getattr(function, "cache_clear", None)
    if callable(clear):
        clear()


def _lookup_structure(name: str) -> tuple[str, str]:
    catalog = v2.load_music_catalog_v2()["song_structure"]
    row = next((item for item in catalog if item.get("name") == name), None)
    if row:
        return name, v2.m3._clean_text(row.get("prompt"))
    return name, ""


def reference_scaffold(
    reference: str,
    raw: Mapping[str, str],
    resolved: Mapping[str, Mapping[str, str]],
    overrides: set[str],
) -> tuple[str, str]:
    # A deliberate manual structure override is absolute.
    if "song_structure" in overrides:
        name = v2.m3._clean_text(resolved.get("song_structure", {}).get("name"))
        return name, v2.m3._clean_text(resolved.get("song_structure", {}).get("prompt"))

    # Deep-curated references get the reviewed scaffold even if an old source
    # row happened to contain a generic structure from the previous preset
    # system. This is the same principle as removing hidden base-preset baggage.
    curated = rules.REFERENCE_STRUCTURE_OVERRIDES.get(reference.casefold())
    if curated:
        return _lookup_structure(curated)

    # A real explicitly-authored reference structure is useful for fallback
    # profiles; look it up directly because the visible generic control is now
    # neutral by design.
    raw_name = v2.m3._clean_text(raw.get("song_structure"))
    if raw_name:
        name, prompt = _lookup_structure(raw_name)
        if prompt:
            return name, prompt

    genre = v2.broad_genre_for(resolved.get("genre", {}).get("name"))
    fallback = rules.REFERENCE_STRUCTURE_DEFAULTS.get(genre, "Pop Classic")
    return _lookup_structure(fallback)


@lru_cache(maxsize=1)
def load_builtin_music_presets_reference_genres():
    presets = copy.deepcopy(_NEUTRAL_LOAD_BUILTINS())
    for row in presets.values():
        reference = v2.m3._clean_text(row.get("reference"))
        if not reference:
            continue
        parent = REFERENCE_GENRE_OVERRIDES.get(reference.casefold())
        if parent:
            row["genre"] = parent
    return presets


def _annotate_reference_rows(rows):
    presets = v2.m3.load_music_presets()
    for row in rows:
        reference = v2.m3._clean_text(row.get("reference"))
        if not reference:
            continue
        backend = presets.get(row.get("name"), {})
        source = backend.get("__dna_source", row.get("dna_source", ""))
        detail = (
            "Music Data v2 uses independent artist-neutral Reference DNA; the generic controls below start neutral and become deliberate overrides."
        )
        description = v2.m3._clean_text(row.get("description"))
        if detail not in description:
            row["description"] = f"{description} {detail}".strip()
        row["dna_source"] = source
        row["reference_controls_neutral"] = True
    return rows


def preset_api_rows_reference_explanation():
    return _annotate_reference_rows(_V2_PRESET_API_ROWS())


def controls_api_reference_explanation():
    payload = _V2_CONTROLS_API()
    payload = copy.deepcopy(payload)
    payload["presets"] = _annotate_reference_rows(payload.get("presets", []))
    payload["reference_controls_policy"] = "neutral_generic_controls_with_independent_dna"
    return payload


rules._reference_scaffold = reference_scaffold
v2.m3._load_builtin_music_presets = load_builtin_music_presets_reference_genres
v2.m3._preset_api_rows = preset_api_rows_reference_explanation
v2.m3._music_controls_api_payload = controls_api_reference_explanation
_clear_cache(v2.m3.load_music_presets)
