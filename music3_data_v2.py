"""NovoLoko Music Data v2 compatibility layer.

This module deliberately patches the existing MiniMax Music 3 implementation
instead of replacing its serialized node contract.  The v4.6.x backend widgets,
recipes and workflow links stay intact while the user-facing music data becomes
more coherent.
"""

from __future__ import annotations

from collections import Counter, OrderedDict, defaultdict
import copy
import csv
from functools import lru_cache
from pathlib import Path
import re
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Sequence, Tuple

from . import music3_nodes as m3


DATA_ROOT = Path(__file__).with_name("csv") / "music3"
STYLE_V2_PATH = DATA_ROOT / "22_styles_v2.csv"
ARTIST_DNA_PATH = DATA_ROOT / "23_artist_dna.csv"
PRESET_OVERRIDES_PATH = DATA_ROOT / "24_preset_overrides_v2.csv"
MUSIC_DATA_VERSION = "2"

# These are intentionally broad top-level lanes.  Existing v4.6.x genre values
# remain in the backend catalog so old workflows still deserialize; the custom
# Music Controls UI exposes this smaller, understandable set.
BROAD_GENRES: "OrderedDict[str, str]" = OrderedDict(
    (
        ("Hip-Hop / Rap", "Hip-Hop / Rap"),
        ("Pop", "Pop"),
        ("Rock", "Rock"),
        ("Metal", "Metal"),
        ("Punk", "Punk / Hardcore"),
        ("R&B / Soul", "R&B / Soul"),
        ("Electronic", "Electronic / Dance"),
        ("Reggae / Dancehall", "Reggae / Caribbean"),
        ("Latin / Reggaeton", "Latin"),
        ("Afrobeat / Afropop", "African / Afro-Pop"),
        ("Country", "Country"),
        ("Folk / Acoustic", "Folk / Acoustic / Americana"),
        ("Blues", "Blues"),
        ("Jazz", "Jazz"),
        ("Funk", "Funk / Disco"),
        ("Gospel", "Gospel"),
        ("Orchestral / Cinematic", "Cinematic / Orchestral / Score"),
        ("Classical", "Classical / Theatre"),
        ("Ambient", "Ambient / Meditation"),
        ("Experimental", "Experimental / Hybrid"),
        ("World Fusion", "Global / World Fusion"),
        ("Spoken Word / Voice", "Spoken / Voice"),
        ("New Age / Meditation", "New Age / Meditation"),
        ("Comedy / Novelty", "Comedy / Novelty"),
    )
)

GENRE_FOLDER_NAMES: Dict[str, str] = {
    "Hip-Hop / Rap": "Genre Presets / Hip-Hop & Rap",
    "Pop": "Genre Presets / Pop",
    "Rock": "Genre Presets / Rock & Alternative",
    "Metal": "Genre Presets / Metal",
    "Punk": "Genre Presets / Punk & Hardcore",
    "R&B / Soul": "Genre Presets / R&B & Soul",
    "Electronic": "Genre Presets / Electronic & Dance",
    "Reggae / Dancehall": "Genre Presets / Reggae & Caribbean",
    "Latin / Reggaeton": "Genre Presets / Latin",
    "Afrobeat / Afropop": "Genre Presets / African & Afro-Pop",
    "Country": "Genre Presets / Country",
    "Folk / Acoustic": "Genre Presets / Folk & Americana",
    "Blues": "Genre Presets / Blues",
    "Jazz": "Genre Presets / Jazz",
    "Funk": "Genre Presets / Funk & Disco",
    "Gospel": "Genre Presets / Gospel",
    "Orchestral / Cinematic": "Genre Presets / Cinematic & Score",
    "Classical": "Genre Presets / Classical & Theatre",
    "Ambient": "Genre Presets / Ambient & Meditation",
    "Experimental": "Genre Presets / Experimental & Hybrid",
    "World Fusion": "Genre Presets / Global & World",
    "Spoken Word / Voice": "Spoken / Voice",
    "New Age / Meditation": "Genre Presets / Ambient & Meditation",
    "Comedy / Novelty": "Utility / Comedy & Novelty",
}

# Reference-DNA traits intentionally map to controls rather than one giant text
# blob.  A manual control override removes only the matching artist-neutral DNA
# trait, preserving the rest of a Clone/Like profile.
DNA_TRAIT_KEYS: "OrderedDict[str, Tuple[str, ...]]" = OrderedDict(
    (
        ("scene", ("genre", "subgenre_era")),
        ("vocals", ("vocal_gender_type", "vocal_delivery")),
        ("instruments", ("instruments",)),
        ("groove", ("bpm_tempo",)),
        ("arrangement", ("song_structure",)),
        ("hooks", ("hook_style",)),
        ("dynamics", ("mood", "aggression", "darkness")),
        ("production", ("production_style",)),
        ("songwriting", ("themes", "rhyme_density", "wordplay", "storytelling", "adlibs")),
    )
)

DNA_TRAIT_LABELS = {
    "scene": "era, genre and scene",
    "vocals": "vocal character and delivery",
    "instruments": "instrument, drum, bass, guitar and synth identity",
    "groove": "tempo tendency and groove",
    "arrangement": "arrangement and section habits",
    "hooks": "hook tendencies",
    "dynamics": "dynamics and emotional arc",
    "production": "mix and production character",
    "songwriting": "songwriting and phrasing character",
}

LYRIC_SAFE_RANDOM_KEYS = (
    "themes",
    "explicitness",
    "rhyme_density",
    "wordplay",
    "storytelling",
    "adlibs",
    "song_length",
)

_ORIGINAL_LOAD_CATALOG = m3.load_music_catalog
_ORIGINAL_LOAD_BUILTINS = m3._load_builtin_music_presets
_ORIGINAL_PRESET_API_ROWS = m3._preset_api_rows
_ORIGINAL_CONTROLS_API = m3._music_controls_api_payload
_ORIGINAL_REFERENCE_DNA = m3._reference_dna
_ORIGINAL_RESOLVE_SELECTIONS = m3.NovaMusicControls.resolve_selections.__func__
_ORIGINAL_BUILD = m3.NovaMusicControls.build


def _read_rows(path: Path) -> List[Dict[str, str]]:
    if not path.is_file():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return [
            {str(key or "").strip(): m3._clean_text(value) for key, value in row.items()}
            for row in csv.DictReader(handle)
        ]


@lru_cache(maxsize=1)
def _style_overlay_rows() -> Tuple[Dict[str, str], ...]:
    return tuple(row for row in _read_rows(STYLE_V2_PATH) if row.get("name") and row.get("prompt"))


@lru_cache(maxsize=1)
def _raw_reference_rows() -> Tuple[Dict[str, str], ...]:
    return tuple(_read_rows(DATA_ROOT / "21_reference_presets.csv"))


@lru_cache(maxsize=1)
def _curated_dna() -> Dict[str, Dict[str, str]]:
    profiles: Dict[str, Dict[str, str]] = {}
    for row in _read_rows(ARTIST_DNA_PATH):
        reference = row.get("reference", "")
        if not reference:
            continue
        profiles[reference.casefold()] = {
            key: row.get(key, "") for key in DNA_TRAIT_KEYS
        }
    return profiles


@lru_cache(maxsize=1)
def _preset_overrides() -> Dict[str, Dict[str, str]]:
    result: Dict[str, Dict[str, str]] = defaultdict(dict)
    for row in _read_rows(PRESET_OVERRIDES_PATH):
        name, field, value = row.get("preset", ""), row.get("field", ""), row.get("value", "")
        if name and field in m3.CATEGORY_SPECS and value:
            result[name][field] = value
    return dict(result)


def broad_genre_for(value: Any) -> str:
    """Map legacy child genres and style-like genres to one broad UI parent."""

    text = m3._clean_text(value)
    if text in BROAD_GENRES:
        return text
    folded = text.casefold()

    if any(token in folded for token in ("spoken", "podcast", "voice only", "monologue", "asmr")):
        return "Spoken Word / Voice"
    if any(token in folded for token in ("comedy", "novelty")):
        return "Comedy / Novelty"
    if any(token in folded for token in (
        "metal", "thrash", "doom", "deathcore", "death metal", "black metal", "metalcore",
        "nu metal", "power metal", "symphonic metal", "stoner metal", "groove metal",
    )):
        return "Metal"
    if any(token in folded for token in ("punk", "hardcore")):
        return "Punk"
    if any(token in folded for token in (
        "hip-hop", "hip hop", "rap", "trap", "drill", "boom bap", "g-funk", "g funk",
        "grime", "phonk", "jersey club", "memphis", "cloud rap",
    )):
        return "Hip-Hop / Rap"
    if any(token in folded for token in ("r&b", "rnb", "neo-soul", "neo soul", "quiet storm", "new jack", "soul")):
        return "R&B / Soul"
    if any(token in folded for token in ("reggae", "dancehall", "dub", "ska", "rocksteady", "lovers rock")):
        return "Reggae / Dancehall"
    if any(token in folded for token in ("reggaeton", "latin", "salsa", "bachata")):
        return "Latin / Reggaeton"
    if any(token in folded for token in ("afrobeat", "afrobeats", "afropop", "afrofusion", "amapiano", "afro house")):
        return "Afrobeat / Afropop"
    if any(token in folded for token in ("country", "nashville")):
        return "Country"
    if any(token in folded for token in ("folk", "americana", "bluegrass", "appalach", "singer-songwriter", "singer songwriter")):
        return "Folk / Acoustic"
    if "blues" in folded:
        return "Blues"
    if any(token in folded for token in ("jazz", "bebop", "big band")):
        return "Jazz"
    if any(token in folded for token in ("funk", "disco")):
        return "Funk"
    if "gospel" in folded:
        return "Gospel"
    if any(token in folded for token in ("film score", "soundtrack", "score", "trailer", "cinematic", "orchestral")):
        return "Orchestral / Cinematic"
    if any(token in folded for token in ("classical", "opera", "musical theatre", "musical theater", "chamber")):
        return "Classical"
    if any(token in folded for token in ("new age", "meditation")):
        return "New Age / Meditation"
    if any(token in folded for token in ("ambient", "drone")):
        return "Ambient"
    if any(token in folded for token in (
        "house", "techno", "trance", "drum and bass", "dnb", "jungle", "dubstep", "bass music",
        "garage", "future bass", "breakbeat", "synthwave", "vaporwave", "idm", "hardstyle",
        "trip-hop", "trip hop", "electronic", "electro swing", "industrial future",
    )):
        return "Electronic"
    if any(token in folded for token in (
        "k-pop", "kpop", "j-pop", "jpop", "city pop", "girl group", "boy group", "pop", "dream pop",
        "hyperpop", "electropop",
    )):
        return "Pop"
    if any(token in folded for token in (
        "rock", "grunge", "shoegaze", "britpop", "post-punk", "post punk", "gothic", "darkwave",
        "emo", "garage rock", "art rock", "math rock",
    )):
        return "Rock"
    if any(token in folded for token in ("world", "celtic", "middle eastern", "indian fusion")):
        return "World Fusion"
    if any(token in folded for token in ("experimental", "glitch", "avant", "genre roulette", "noise")):
        return "Experimental"
    return "Experimental"


def load_music_catalog_v2() -> "OrderedDict[str, List[Dict[str, str]]]":
    catalog = _ORIGINAL_LOAD_CATALOG()
    styles = list(catalog["subgenre_era"])
    existing = {row["name"] for row in styles}
    for source in _style_overlay_rows():
        if source["name"] in existing:
            continue
        row = dict(source)
        row["_random_weight"] = row.get("weight", "10") or "10"
        styles.append(row)
        existing.add(row["name"])
    catalog["subgenre_era"] = styles
    return catalog


def _catalog_prompt(catalog: Mapping[str, Sequence[Mapping[str, str]]], key: str, value: str) -> str:
    if not value:
        return ""
    lookup = value
    if key == "genre":
        lookup = broad_genre_for(value)
    for row in catalog.get(key, []):
        if row.get("name") == lookup:
            return m3._clean_text(row.get("prompt"))
    return ""


def _derive_reference_traits(raw: Mapping[str, str], catalog: Mapping[str, Sequence[Mapping[str, str]]]) -> Dict[str, str]:
    def joined(*keys: str) -> str:
        return " ".join(
            prompt for prompt in (_catalog_prompt(catalog, key, raw.get(key, "")) for key in keys)
            if prompt
        ).strip()

    return {
        "scene": joined("genre", "subgenre_era"),
        "vocals": joined("vocal_gender_type", "vocal_delivery"),
        "instruments": joined("instruments"),
        "groove": joined("bpm_tempo"),
        "arrangement": joined("song_structure"),
        "hooks": joined("hook_style"),
        "dynamics": joined("mood", "aggression", "darkness"),
        "production": joined("production_style"),
        "songwriting": joined("themes", "rhyme_density", "wordplay", "storytelling", "adlibs"),
    }


def _reference_rows_by_label() -> Dict[str, Dict[str, str]]:
    result: Dict[str, Dict[str, str]] = {}
    for row in _raw_reference_rows():
        reference = row.get("reference", "")
        if reference and reference.casefold() not in result:
            result[reference.casefold()] = dict(row)
    return result


def _validate_preset_rows(presets: Mapping[str, Mapping[str, Any]]) -> None:
    catalog = load_music_catalog_v2()
    valid_names = {key: {item["name"] for item in rows} for key, rows in catalog.items()}
    for name, row in presets.items():
        for key in m3.CATEGORY_SPECS:
            value = m3._clean_text(row.get(key))
            if not value:
                raise RuntimeError(f"Music Data v2 preset {name!r} is missing {key!r}.")
            if value not in valid_names[key]:
                raise RuntimeError(f"Music Data v2 preset {name!r} has unknown {key}={value!r}.")


@lru_cache(maxsize=1)
def _builtins_cache() -> "OrderedDict[str, Dict[str, Any]]":
    presets = copy.deepcopy(_ORIGINAL_LOAD_BUILTINS())
    overrides = _preset_overrides()

    # First repair generic presets and normalize every preset's broad genre.
    for name, row in presets.items():
        row["genre"] = broad_genre_for(row.get("genre"))
        if name in overrides:
            row.update(overrides[name])

    raw_by_reference = _reference_rows_by_label()
    catalog = load_music_catalog_v2()
    curated = _curated_dna()

    # Reference variants still carry complete 19-control values for workflow
    # compatibility, but artist DNA is rebuilt only from explicit reference-row
    # traits plus curated overrides.  Generic base-preset leftovers never enter
    # the Reference DNA block anymore.
    for name, row in presets.items():
        reference = m3._clean_text(row.get("reference"))
        if not reference:
            continue
        raw = raw_by_reference.get(reference.casefold(), {})
        base_name = m3._clean_text(row.get("base_preset"))
        base = presets.get(base_name, {})
        if base:
            for key in m3.CATEGORY_SPECS:
                if not m3._clean_text(raw.get(key)) and m3._clean_text(base.get(key)):
                    row[key] = base[key]
        row["genre"] = broad_genre_for(row.get("genre"))
        traits = _derive_reference_traits(raw, catalog)
        curated_traits = curated.get(reference.casefold(), {})
        for trait, value in curated_traits.items():
            if m3._clean_text(value):
                traits[trait] = m3._clean_text(value)
        row["__dna_traits"] = {key: value for key, value in traits.items() if value}
        row["__dna_source"] = "curated Music Data v2" if curated_traits else "explicit reference-row DNA"
        if row.get("reference_mode") == "Clone":
            row["reference_strength"] = "Music Data v2 — strong / trait locked"
        elif row.get("reference_mode") == "Like":
            row["reference_strength"] = "Music Data v2 — recognisable / flexible"

    _validate_preset_rows(presets)
    return presets


def load_builtin_music_presets_v2() -> "OrderedDict[str, Dict[str, Any]]":
    return copy.deepcopy(_builtins_cache())


def _style_parent_map() -> Dict[str, str]:
    catalog = load_music_catalog_v2()
    overlay = {row["name"]: row.get("parent_genre", "") for row in _style_overlay_rows()}
    votes: Dict[str, Counter[str]] = defaultdict(Counter)
    for source in [*_read_rows(DATA_ROOT / "20_presets.csv"), *_raw_reference_rows()]:
        style = m3._clean_text(source.get("subgenre_era"))
        genre = m3._clean_text(source.get("genre"))
        if style and genre:
            votes[style][broad_genre_for(genre)] += 1

    result: Dict[str, str] = {}
    for row in catalog["subgenre_era"]:
        name = row["name"]
        explicit = broad_genre_for(overlay.get(name, "")) if overlay.get(name) else ""
        if explicit and explicit != "Experimental":
            result[name] = explicit
            continue
        heuristic = broad_genre_for(f"{name} {row.get('prompt', '')}")
        if heuristic != "Experimental" or any(token in name.casefold() for token in ("experimental", "glitch", "noise", "roulette")):
            result[name] = heuristic
            continue
        if votes.get(name):
            result[name] = votes[name].most_common(1)[0][0]
        else:
            result[name] = "Experimental"
    return result


def compatible_style_rows(genre: Any) -> List[Dict[str, str]]:
    parent = broad_genre_for(genre)
    parents = _style_parent_map()
    return [
        row for row in load_music_catalog_v2()["subgenre_era"]
        if parents.get(row["name"]) == parent
    ]


def reference_dna_v2(
    resolved: Mapping[str, Mapping[str, str]],
    mode: str,
    overrides: set[str],
) -> Tuple[str, List[str], List[str]]:
    metadata = resolved.get("genre", {})
    traits = metadata.get("__reference_dna_traits") if isinstance(metadata, Mapping) else None
    if not isinstance(traits, Mapping) or not traits:
        return _ORIGINAL_REFERENCE_DNA(resolved, mode, overrides)

    lines: List[str] = []
    locked: List[str] = []
    influenced: List[str] = []
    for trait, keys in DNA_TRAIT_KEYS.items():
        text = m3._clean_text(traits.get(trait))
        if not text:
            continue
        overridden = any(key in overrides for key in keys)
        if overridden:
            # Manual controls are already included in the normal brief. Omitting
            # this DNA trait prevents the old artist trait from fighting them.
            continue
        label = DNA_TRAIT_LABELS[trait]
        lines.append(f"- {label}: {text}")
        if mode == "Clone":
            locked.append(label)
        else:
            influenced.append(label)

    if not lines:
        return "", locked, influenced
    if mode == "Clone":
        heading = (
            "Reference DNA priority (very high). Reference mode: Clone. Treat the following artist-neutral musical DNA as the dominant sound identity. "
            "A manual Music Controls change replaces only its matching DNA trait. Never mention or insert an artist name. Locked Reference DNA:\n"
        )
    else:
        heading = (
            "Reference DNA priority (recognisable but flexible). Reference mode: Like. Preserve the following artist-neutral musical DNA as a clear family resemblance while allowing original melody, section detail and production decisions. "
            "Manual Music Controls changes take priority. Never mention or insert an artist name. Influenced Reference DNA:\n"
        )
    return heading + "\n".join(lines), locked, influenced


def _guided_preset_candidates() -> List[Dict[str, Any]]:
    candidates: List[Dict[str, Any]] = []
    for name, row in m3.load_music_presets().items():
        if row.get("__source") != "built-in" or row.get("reference") or m3._safe_bool(row.get("__hidden"), False):
            continue
        genre = broad_genre_for(row.get("genre"))
        if genre == "Spoken Word / Voice":
            weight = 0.5
        elif genre in {"Comedy / Novelty", "Experimental"}:
            weight = 1.5
        elif genre in {"Ambient", "New Age / Meditation", "Orchestral / Cinematic", "Classical"}:
            weight = 4.0
        else:
            weight = 12.0
        if name in {"Gregorian Drill Opera / Holy 808", "CUDA Out of Memory", "What Did I Generate"}:
            weight = 0.35
        candidates.append({"name": name, "_random_weight": weight})
    return candidates


def _mark_random(row: MutableMapping[str, str]) -> MutableMapping[str, str]:
    row["_choice"] = m3.RANDOM_OPTION
    row["_report"] = f"{m3.RANDOM_OPTION} -> {m3._choice_display('', row) or row.get('name', '')}"
    return row


def _random_category(seed: int, key: str, allow_none: bool, custom_text: str = "") -> Dict[str, str]:
    rows = load_music_catalog_v2()[key]
    if key == "explicitness":
        rows = [row for row in rows if row.get("name") != "Instrumental"]
    return m3._resolve_category_choice(
        seed,
        key,
        rows,
        m3.RANDOM_OPTION,
        custom_text,
        allow_none,
    )


def resolve_selections_v2(
    cls,
    preset: str = "Heavy Rap / Trap / Drill",
    randomize_all: bool = False,
    seed: int = 0,
    **selections: Any,
):
    seed = m3._safe_int(seed, 0, 0, m3.SEED_MAX)
    requested_all = m3._safe_bool(randomize_all, False) or m3._clean_text(preset) == m3.RANDOM_PRESET

    if requested_all:
        candidates = _guided_preset_candidates()
        if not candidates:
            return _ORIGINAL_RESOLVE_SELECTIONS(cls, preset, randomize_all, seed, **selections)
        skeleton = m3._seeded_choice(seed, "guided-preset-v2", candidates)["name"]
        safe_selections = dict(selections)
        safe_selections["random_preset_scope"] = "Off"
        safe_selections["random_preset_filter"] = ""
        resolved, _effective, _randomized, resolved_seed = _ORIGINAL_RESOLVE_SELECTIONS(
            cls,
            skeleton,
            False,
            seed,
            **safe_selections,
        )
        allow_none = m3._safe_bool(selections.get("allow_random_none"), False)
        instrumental = (
            "instrumental" in m3._clean_text(resolved.get("vocal_delivery", {}).get("name")).casefold()
            or "instrumental" in m3._clean_text(resolved.get("vocal_gender_type", {}).get("name")).casefold()
        )
        if not instrumental:
            for key in LYRIC_SAFE_RANDOM_KEYS:
                custom = m3._clean_text(selections.get(f"custom_{key}", ""))
                resolved[key] = _random_category(resolved_seed, key, allow_none, custom)
        for key, row in resolved.items():
            if isinstance(row, MutableMapping):
                row["_choice"] = m3.RANDOM_OPTION
                row["_report"] = f"{m3.RANDOM_OPTION} -> {row.get('name', '')} (guided by {skeleton})"
                row["__guided_preset"] = skeleton
        return resolved, skeleton, True, resolved_seed

    # Migrate old child-genre values to their broad parent without losing the
    # actual Style / Era selection that carries the detail.
    migrated = dict(selections)
    requested_genre = m3._clean_text(migrated.get("genre", m3.CATEGORY_SPECS["genre"]["default"]))
    if requested_genre not in {m3.NONE_OPTION, m3.CUSTOM_OPTION, m3.RANDOM_OPTION}:
        migrated["genre"] = broad_genre_for(requested_genre)

    resolved, effective, randomized, resolved_seed = _ORIGINAL_RESOLVE_SELECTIONS(
        cls,
        preset,
        False,
        seed,
        **migrated,
    )

    # A per-control Random Style / era now respects the selected broad genre.
    if m3._clean_text(selections.get("subgenre_era")) == m3.RANDOM_OPTION:
        styles = compatible_style_rows(resolved.get("genre", {}).get("name"))
        if styles:
            chosen = m3._seeded_choice(resolved_seed, "subgenre_era:compatible-v2", styles)
            resolved["subgenre_era"] = m3._catalog_selection(chosen, m3.RANDOM_OPTION)

    reference_row = m3.load_music_presets().get(effective, {})
    traits = reference_row.get("__dna_traits")
    if isinstance(traits, Mapping) and traits:
        resolved["genre"]["__reference_dna_traits"] = dict(traits)
        resolved["genre"]["__reference_dna_source"] = reference_row.get("__dna_source", "Music Data v2")
    return resolved, effective, randomized, resolved_seed


def _reference_folder_sort(folder: str) -> int:
    folded = folder.casefold()
    order = (
        "rock", "metal", "punk", "pop", "girl", "hip-hop", "rap", "r&b", "soul",
        "electronic", "country", "folk", "reggae", "latin", "afro", "jazz", "blues", "cinematic",
    )
    for index, token in enumerate(order):
        if token in folded:
            return index
    return len(order)


def preset_api_rows_v2() -> List[Dict[str, Any]]:
    rows = _ORIGINAL_PRESET_API_ROWS()
    presets = m3.load_music_presets()
    for row in rows:
        source = row.get("source")
        reference = m3._clean_text(row.get("reference"))
        if source == "user":
            row["folder"] = "My Presets"
        elif reference:
            row["folder"] = row.get("folder") or "Artist References / More"
            backend = presets.get(row["name"], {})
            row["dna_source"] = backend.get("__dna_source", "")
        else:
            genre = broad_genre_for(row.get("selections", {}).get("genre"))
            row["folder"] = GENRE_FOLDER_NAMES.get(genre, "Genre Presets / More")

    def key(row: Mapping[str, Any]):
        if row.get("source") == "user":
            return (90, 0, "", m3._clean_text(row.get("name")).casefold(), 0)
        reference = m3._clean_text(row.get("reference"))
        if reference:
            mode = m3._clean_text(row.get("reference_mode"))
            mode_order = 0 if mode == "Clone" else 1 if mode == "Like" else 2
            return (50, _reference_folder_sort(m3._clean_text(row.get("folder"))), reference.casefold(), "", mode_order)
        genre = broad_genre_for(row.get("selections", {}).get("genre"))
        genre_order = list(BROAD_GENRES).index(genre) if genre in BROAD_GENRES else 99
        return (10, genre_order, "", m3._clean_text(row.get("name")).casefold(), 0)

    return sorted(rows, key=key)


def controls_api_payload_v2() -> Dict[str, Any]:
    payload = _ORIGINAL_CONTROLS_API()
    catalog = load_music_catalog_v2()
    parents = _style_parent_map()
    categories = []
    for category in payload.get("categories", []):
        item = dict(category)
        if item.get("key") == "genre":
            by_name = {row["name"]: row for row in catalog["genre"]}
            options = []
            for value, label in BROAD_GENRES.items():
                row = by_name.get(value)
                if not row:
                    continue
                options.append(
                    {
                        "value": value,
                        "label": label,
                        "description": row.get("description") or row.get("prompt", ""),
                    }
                )
            item["options"] = options
        elif item.get("key") == "subgenre_era":
            enriched = []
            for option in item.get("options", []):
                option = dict(option)
                option["parent_genre"] = parents.get(option.get("value", ""), "Experimental")
                enriched.append(option)
            item["options"] = enriched
        categories.append(item)
    payload["categories"] = categories
    payload["presets"] = preset_api_rows_v2()
    payload["music_data_version"] = MUSIC_DATA_VERSION
    payload["genre_families"] = [
        {"value": value, "label": label}
        for value, label in BROAD_GENRES.items()
    ]
    payload["style_parent_map"] = parents
    payload["guided_randomization"] = True
    return payload


def build_v2(self, preset="Heavy Rap / Trap / Drill", randomize_all=False, seed=0, **selections):
    result = list(_ORIGINAL_BUILD(self, preset, randomize_all, seed, **selections))
    report = m3._clean_text(result[3])
    requested_all = m3._safe_bool(randomize_all, False) or m3._clean_text(preset) == m3.RANDOM_PRESET
    if requested_all and "Random strategy:" not in report:
        lines = report.splitlines()
        insert_at = next((index + 1 for index, line in enumerate(lines) if line.startswith("Randomize all:")), 2)
        lines.insert(insert_at, "Random strategy: Guided Music Data v2 — coherent preset skeleton + lyric-side variation")
        report = "\n".join(lines)
        result[3] = report
    try:
        recipe = dict(__import__("json").loads(result[7]))
        recipe["music_data_version"] = MUSIC_DATA_VERSION
        recipe["random_strategy"] = "guided_preset_skeleton_v2" if requested_all else "direct_controls_v2"
        result[7] = __import__("json").dumps(recipe, ensure_ascii=False)
    except Exception:
        pass
    return tuple(result)


def _install() -> None:
    m3.load_music_catalog = load_music_catalog_v2
    m3._load_builtin_music_presets = load_builtin_music_presets_v2
    m3._reference_dna = reference_dna_v2
    m3._preset_api_rows = preset_api_rows_v2
    m3._music_controls_api_payload = controls_api_payload_v2
    m3.NovaMusicControls.resolve_selections = classmethod(resolve_selections_v2)
    m3.NovaMusicControls.build = build_v2


_install()
