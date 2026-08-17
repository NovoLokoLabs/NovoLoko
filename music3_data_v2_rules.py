"""Reviewable curation rules layered onto Music Data v2.

These rules handle ambiguous family names and, more importantly, ensure an
artist-reference preset never reintroduces generic base-preset baggage through
the normal caption/lyric fields after Reference DNA has been built.
"""

from __future__ import annotations

from functools import lru_cache
import json
from typing import Any, Mapping

from . import music3_data_v2 as v2


_ORIGINAL_BROAD_GENRE_FOR = v2.broad_genre_for
_ORIGINAL_CURATED_DNA = v2._curated_dna
_V2_BUILD = v2.m3.NovaMusicControls.build

# Names containing "pop" are not necessarily Pop. Handle established rock
# family labels before the broad heuristic sees that token.
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

# A concrete lyric section scaffold is still useful even when the full musical
# arrangement lives in free-form DNA. These are neutral genre defaults, not
# claimed artist traits. Curated references get a closer scaffold below.
REFERENCE_STRUCTURE_DEFAULTS = {
    "Hip-Hop / Rap": "Rap Anthem",
    "Pop": "Pop Classic",
    "Rock": "Rock Escalation",
    "Metal": "Rock Escalation",
    "Punk": "Punk Two Minute",
    "R&B / Soul": "R&B Slow Jam",
    "Electronic": "EDM Vocal Journey",
    "Reggae / Dancehall": "Pop Classic",
    "Latin / Reggaeton": "Pop Classic",
    "Afrobeat / Afropop": "Pop Classic",
    "Country": "Country Story Arc",
    "Folk / Acoustic": "Story Ballad",
    "Blues": "Story Ballad",
    "Jazz": "Jazz Head Solos Head",
    "Funk": "Pop Classic",
    "Gospel": "Gospel Testimony",
    "Orchestral / Cinematic": "Cinematic Instrumental",
    "Classical": "Cinematic Instrumental",
    "Ambient": "Ambient Evolution",
    "Experimental": "Progressive Long Form",
    "World Fusion": "Progressive Long Form",
    "Spoken Word / Voice": "Continuous Spoken Monologue",
    "New Age / Meditation": "Ambient Evolution",
    "Comedy / Novelty": "Pop Classic",
}

REFERENCE_STRUCTURE_OVERRIDES = {
    "missy elliott": "Hook First",
    "måneskin": "Rock Escalation",
    "counting crows": "Story Ballad",
    "nirvana": "Rock Quiet Loud",
    "pearl jam": "Rock Escalation",
    "alice in chains": "Rock Quiet Loud",
    "soundgarden": "Progressive Long Form",
    "paramore": "Pop Classic",
    "the cranberries": "Pop Classic",
    "no doubt": "Pop Classic",
    "garbage": "Pop Classic",
    "hole": "Rock Quiet Loud",
    "evanescence": "Rock Escalation",
    "florence + the machine": "Progressive Long Form",
    "wolf alice": "Rock Quiet Loud",
    "kendrick lamar": "Progressive Long Form",
    "eminem": "Boom Bap Three Verse",
    "dr. dre": "Rap Anthem",
    "outkast": "Progressive Long Form",
    "lauryn hill": "R&B Slow Jam",
    "beyoncé": "Pop Classic",
    "rihanna": "Pop Immediate Chorus",
    "sza": "R&B Slow Jam",
    "billie eilish": "Hook First",
    "lady gaga": "Pop Classic",
    "dua lipa": "Pop Classic",
    "chappell roan": "Pop Classic",
    "olivia rodrigo": "Pop Classic",
    "blackpink": "K-Pop Multi-Section Switch-Up",
    "newjeans": "Pop Immediate Chorus",
    "twice": "K-Pop Multi-Section Switch-Up",
}


def _clear_cache(function: Any) -> None:
    """Clear an lru cache when present; plain functions are valid too.

    NovoLoko's import-safety tests load the package under several synthetic
    package names. Never make unrelated node registration depend on a cache
    decorator being present on a helper.
    """

    clear = getattr(function, "cache_clear", None)
    if callable(clear):
        clear()


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


def _raw_reference_row(reference: str) -> Mapping[str, str]:
    return v2._reference_rows_by_label().get(reference.casefold(), {})


def _prompt_for(resolved: Mapping[str, Mapping[str, str]], key: str) -> str:
    row = resolved.get(key, {})
    return v2.m3._clean_text(row.get("prompt"))


def _reference_scaffold(
    reference: str,
    raw: Mapping[str, str],
    resolved: Mapping[str, Mapping[str, str]],
    overrides: set[str],
) -> tuple[str, str]:
    # Explicit reference data and deliberate manual edits win. Otherwise use a
    # neutral broad-family scaffold instead of the old generic base preset.
    if "song_structure" in overrides or v2.m3._clean_text(raw.get("song_structure")):
        name = v2.m3._clean_text(resolved.get("song_structure", {}).get("name"))
        return name, _prompt_for(resolved, "song_structure")

    name = REFERENCE_STRUCTURE_OVERRIDES.get(reference.casefold())
    if not name:
        genre = broad_genre_for(resolved.get("genre", {}).get("name"))
        name = REFERENCE_STRUCTURE_DEFAULTS.get(genre, "Pop Classic")
    catalog = v2.load_music_catalog_v2()["song_structure"]
    row = next((item for item in catalog if item.get("name") == name), None)
    if row:
        return name, v2.m3._clean_text(row.get("prompt"))
    return name, _prompt_for(resolved, "song_structure")


def build_without_reference_base_baggage(
    self,
    preset="Heavy Rap / Trap / Drill",
    randomize_all=False,
    seed=0,
    **selections: Any,
):
    result = list(_V2_BUILD(self, preset, randomize_all, seed, **selections))
    try:
        recipe = json.loads(result[7])
    except Exception:
        return tuple(result)

    reference = v2.m3._clean_text(recipe.get("reference_label"))
    mode = v2.m3._clean_text(recipe.get("reference_mode"))
    if not reference or mode not in v2.m3.REFERENCE_MODES:
        return tuple(result)

    resolved, effective, _randomized, resolved_seed = v2.m3.NovaMusicControls.resolve_selections(
        preset=preset,
        randomize_all=randomize_all,
        seed=seed,
        **selections,
    )
    reference_row = v2.m3.load_music_presets().get(effective, {})
    traits = reference_row.get("__dna_traits", {})
    if not isinstance(traits, Mapping):
        traits = {}
    raw = _raw_reference_row(reference)
    explicit_keys = {
        key for key in v2.m3.CATEGORY_SPECS
        if v2.m3._clean_text(raw.get(key))
    }
    overrides = {
        key for key in recipe.get("reference_overrides", [])
        if key in v2.m3.CATEGORY_SPECS
    }

    reference_dna, locked, influenced = v2.reference_dna_v2(resolved, mode, overrides)
    covered_keys: set[str] = set()
    active_traits: list[tuple[str, str]] = []
    for trait, keys in v2.DNA_TRAIT_KEYS.items():
        text = v2.m3._clean_text(traits.get(trait))
        if not text:
            continue
        if any(key in overrides for key in keys):
            continue
        covered_keys.update(keys)
        active_traits.append((trait, text))

    # Explicitness and duration are user policy, not artist imitation. Always
    # honour their visible control values. Other generic base-fill values are
    # omitted unless the reference row explicitly supplied them or the user
    # deliberately overrode that control.
    always_include = {"explicitness", "song_length"}

    def include_key(key: str) -> bool:
        if key in always_include or key in overrides:
            return True
        if key in covered_keys:
            return False
        return key in explicit_keys

    def joined(*keys: str) -> str:
        return " ".join(_prompt_for(resolved, key) for key in keys if include_key(key) and _prompt_for(resolved, key)).strip()

    global_text = " ".join(
        part for part in (
            reference_dna,
            joined("genre", "subgenre_era", "mood", "bpm_tempo", "song_length"),
        ) if part
    ).strip()
    vocal_text = joined("vocal_gender_type", "vocal_delivery", "hook_style", "adlibs")
    arrangement_text = joined("instruments", "production_style", "song_structure")
    result[0] = "\n\n".join(
        f"{heading}: {text}"
        for heading, text in (
            ("Global Metadata", global_text),
            ("Vocal Details", vocal_text),
            ("Arrangement", arrangement_text),
        )
        if text
    )

    # The lyric writer also needs the reference's vocal, hook and songwriting
    # character. Previously only the music-caption path saw Reference DNA, which
    # made an artist preset's lyrics much more generic than its production.
    lyric_trait_order = ("scene", "vocals", "hooks", "dynamics", "songwriting", "arrangement", "groove")
    lyric_dna_lines = [
        f"- {v2.DNA_TRAIT_LABELS[trait]}: {text}"
        for trait, text in active_traits
        if trait in lyric_trait_order
    ]
    lyric_dna = ""
    if lyric_dna_lines:
        strength = "strong / trait locked" if mode == "Clone" else "recognisable / flexible"
        lyric_dna = (
            f"Reference lyric DNA ({strength}; artist-neutral):\n"
            + "\n".join(lyric_dna_lines)
            + "\nNever mention or insert an artist name; write an original song."
        )

    structure_name, structure_prompt = _reference_scaffold(reference, raw, resolved, overrides)
    duration = float(result[4])
    if structure_prompt:
        result[2] = v2.m3._duration_section_plan(structure_prompt, duration)

    lyric_items = []
    if lyric_dna:
        lyric_items.append(lyric_dna)
    for label, key in (
        ("Themes", "themes"),
        ("Explicitness", "explicitness"),
        ("Aggression", "aggression"),
        ("Darkness", "darkness"),
        ("Rhyme density", "rhyme_density"),
        ("Wordplay", "wordplay"),
        ("Storytelling", "storytelling"),
        ("Hook", "hook_style"),
        ("Ad-libs", "adlibs"),
    ):
        text = _prompt_for(resolved, key)
        if text and include_key(key):
            lyric_items.append(f"{label}: {text}")
    vocal_override_text = joined("vocal_gender_type", "vocal_delivery")
    if vocal_override_text:
        lyric_items.append(f"Vocal performance override: {vocal_override_text}")
    length_text = _prompt_for(resolved, "song_length")
    if length_text:
        lyric_items.append(f"Length: {length_text}")
    if structure_prompt:
        lyric_items.append(f"Working section scaffold ({structure_name}; adapt phrasing to Reference DNA): {structure_prompt}")
    result[1] = "\n".join(lyric_items)

    suppressed = [
        key for key in v2.m3.CATEGORY_SPECS
        if key not in always_include and key not in overrides and key not in explicit_keys
    ]
    report_lines = str(result[3]).splitlines()
    marker = next(
        (index + 1 for index, line in enumerate(report_lines) if line.startswith("Manual Reference DNA overrides:")),
        0,
    )
    report_lines.insert(
        marker,
        "Reference generation policy: Music Data v2 suppresses generic base-preset fill; generation uses explicit/curated DNA + manual overrides + explicitness/length.",
    )
    report_lines.insert(marker + 1, f"Reference lyric scaffold: {structure_name}")
    result[3] = "\n".join(report_lines)

    recipe["music_data_version"] = v2.MUSIC_DATA_VERSION
    recipe["reference_generation_policy"] = "explicit_curated_dna_no_generic_base_fill"
    recipe["reference_dna_source"] = reference_row.get("__dna_source", "")
    recipe["reference_section_scaffold"] = structure_name
    recipe["suppressed_reference_base_categories"] = suppressed
    recipe["reference_traits_locked"] = locked
    recipe["reference_traits_influenced"] = influenced
    recipe["seed"] = resolved_seed
    result[7] = json.dumps(recipe, ensure_ascii=False)
    return tuple(result)


v2.broad_genre_for = broad_genre_for
v2._curated_dna = curated_dna
_clear_cache(v2._style_parent_map)
_clear_cache(v2._builtins_cache)
v2.m3.NovaMusicControls.build = build_without_reference_base_baggage
