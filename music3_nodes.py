"""NovoLoko MiniMax Music 3 idea, lyric, and caption pipeline."""

from __future__ import annotations

from collections import OrderedDict
import asyncio
import csv
from datetime import datetime, timezone
from functools import lru_cache
import gc
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import random
import re
import shutil
import subprocess
import struct
import threading
import time
from typing import Any, Dict, List, Mapping, Sequence, Tuple
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import wave


SEED_MAX = 0xFFFFFFFFFFFFFFFF
MUSIC_CSV_ROOT = Path(__file__).with_name("csv") / "music3"
SONG_IDEAS_PATH = MUSIC_CSV_ROOT / "27_song_ideas.json"
CUSTOM_PRESET = "Custom / CSV selections"
RANDOM_PRESET = "Randomize Everything"
NONE_PRESET = "None / No preference"
NONE_OPTION = "None / No preference"
CUSTOM_OPTION = "Custom..."
RANDOM_OPTION = "Random"
RANDOM_PRESET_SCOPES = ("Off", "All Presets", "Preset Folder", "Genre")
DEFAULT_AUDIO_FOLDER = "audio/NovoLoko"
DEFAULT_TRACK_NAME = "Holy808"
SUPPORTED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg"}
AUDIO_FORMATS = OrderedDict(
    (
        ("WAV (24-bit)", (".wav", [])),
        ("FLAC", (".flac", ["-c:a", "flac", "-compression_level", "8"])),
        ("MP3 (320 kbps)", (".mp3", ["-c:a", "libmp3lame", "-b:a", "320k"])),
        ("OGG Vorbis", (".ogg", ["-c:a", "libvorbis", "-q:a", "7"])),
    )
)
USER_PRESET_SCHEMA = "novoloko.music3.user-presets.v2"
TRACK_SCHEMA = "novoloko.minimax_music3.track.v2"
CONTROLS_RECIPE_SCHEMA = "novoloko.minimax_music3.controls-recipe.v2"
REFERENCE_MODES = ("Clone", "Like")
OLLAMA_WRITER_URL = "http://127.0.0.1:11434/api/generate"
OLLAMA_TAGS_URL = "http://127.0.0.1:11434/api/tags"
OLLAMA_WRITER_DEFAULT = "novoloko-music-fast"
OLLAMA_RECOMMENDED = OrderedDict(
    (
        ("FAST", "novoloko-music-fast"),
        ("BALANCED", "novoloko-music-balanced"),
        ("GEMMA", "novoloko-music-gemma"),
    )
)
SEED_AFTER_RUN_MODES = ("Fixed", "Randomize Seed")
MODEL_LIFECYCLE_MODES = (
    "Follow legacy cleanup switch",
    "One-off: clean after run",
    "Batch: keep loaded",
)
FAVORITES_INDEX_NAME = ".novoloko_music3_favorites.json"
FAVORITES_SCHEMA = "novoloko.music3.favorites.v1"
_EXTERNAL_LIBRARY_ROOTS: set[Path] = set()
_EXTERNAL_LIBRARY_LOCK = threading.RLock()
_FAVORITES_LOCK = threading.RLock()
WINDOWS_RESERVED_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{index}" for index in range(1, 10)),
    *(f"LPT{index}" for index in range(1, 10)),
}


@lru_cache(maxsize=1)
def load_song_ideas() -> List[Dict[str, Any]]:
    """Load the curated, artist-neutral SONG IDEA picker library."""

    try:
        payload = json.loads(SONG_IDEAS_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        raise RuntimeError(f"NovoLoko SONG IDEA library cannot be read: {error}") from error
    if not isinstance(payload, Mapping) or not isinstance(payload.get("categories"), list):
        raise ValueError("NovoLoko SONG IDEA library must contain a categories list.")
    categories: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for raw_category in payload["categories"]:
        if not isinstance(raw_category, Mapping):
            continue
        name = _clean_text(raw_category.get("name"))
        raw_ideas = raw_category.get("ideas")
        if not name or not isinstance(raw_ideas, list):
            continue
        ideas: List[str] = []
        for raw_idea in raw_ideas:
            idea = _clean_text(raw_idea)
            folded = idea.casefold()
            if not idea or folded in seen:
                continue
            seen.add(folded)
            ideas.append(idea)
        if ideas:
            categories.append({"name": name, "ideas": ideas})
    if sum(len(item["ideas"]) for item in categories) < 150:
        raise ValueError("NovoLoko SONG IDEA library must contain at least 150 unique ideas.")
    return categories


CATEGORY_SPECS: "OrderedDict[str, Dict[str, str]]" = OrderedDict(
    (
        ("genre", {"label": "Genre", "legacy_label": "Genre", "help": "The broad musical lane; presets may narrow it further with style and era.", "file": "01_genre.csv", "default": "Hip-Hop / Rap"}),
        ("subgenre_era", {"label": "Style / era", "legacy_label": "Subgenre / Era", "help": "Narrows the genre to a recognisable sub-style, scene, or time period.", "file": "02_subgenre_era.csv", "default": "Modern Trap / Drill"}),
        ("mood", {"label": "Overall mood", "legacy_label": "Mood", "help": "Sets the emotional colour and how it should develop across the song.", "file": "03_mood.csv", "default": "Menacing and Triumphant"}),
        ("vocal_delivery", {"label": "How should the singer perform?", "legacy_label": "Vocal Delivery", "help": "Controls phrasing, force, rhythm, breath, grit, and emotional delivery.", "file": "04_vocal_delivery.csv", "default": "Deep Aggressive Rap"}),
        ("vocal_gender_type", {"label": "Lead voice type", "legacy_label": "Vocal Gender / Type", "help": "Chooses the lead vocal range, character, or spoken-voice type.", "file": "05_vocal_gender_type.csv", "default": "Deep Male Lead"}),
        ("instruments", {"label": "Band / instrument setup", "legacy_label": "Instruments", "help": "Chooses a practical band, electronic rig, orchestra, or spoken underscore.", "file": "06_instruments.csv", "default": "808s, Dark Piano and Brass"}),
        ("production_style", {"label": "How should it sound?", "legacy_label": "Production Style", "help": "Controls recording character, mix space, polish, punch, width, and texture.", "file": "07_production_style.csv", "default": "Hard Modern Trap Master"}),
        ("bpm_tempo", {"label": "Tempo / BPM", "legacy_label": "BPM / Tempo", "help": "Sets the speed and groove feel, including half-time or double-time interpretation.", "file": "08_bpm_tempo.csv", "default": "142 BPM Half-Time"}),
        ("song_structure", {"label": "Song layout", "legacy_label": "Song Structure", "help": "Chooses the order and pacing of verses, hooks, bridges, drops, or spoken sections.", "file": "09_song_structure.csv", "default": "Rap Anthem"}),
        ("hook_style", {"label": "What kind of chorus / hook?", "legacy_label": "Hook Style", "help": "Chooses the main memorable payoff: sung chorus, chant, riff, drop, or spoken refrain.", "file": "10_hook_style.csv", "default": "Chanted Crowd Hook"}),
        ("themes", {"label": "Lyric themes", "legacy_label": "Themes", "help": "Sets the subject matter without inserting artist names into the lyrics.", "file": "11_themes.csv", "default": "Cash, Cars, Rivals and Paranoia"}),
        ("explicitness", {"label": "Lyric explicitness", "legacy_label": "Explicitness", "help": "Controls how actively the writer uses clean, mature, profane, or adult language.", "file": "12_explicitness.csv", "default": "Explicit"}),
        ("aggression", {"label": "Energy / intensity", "legacy_label": "Aggression", "help": "Controls performance force, drum impact, confrontation, and dynamic peaks.", "file": "13_aggression.csv", "default": "Maximum Impact"}),
        ("darkness", {"label": "Mood darkness", "legacy_label": "Darkness", "help": "Moves the emotional world from bright and open to bleak, noir, or horror-dark.", "file": "14_darkness.csv", "default": "Very Dark"}),
        ("rhyme_density", {"label": "How rhyme-heavy?", "legacy_label": "Rhyme Density", "help": "Controls how often and how technically lines rhyme while staying performable.", "file": "15_rhyme_density.csv", "default": "Dense Multisyllabic"}),
        ("wordplay", {"label": "Lyric wordplay", "legacy_label": "Wordplay", "help": "Chooses direct writing, metaphor, punchlines, symbolism, humour, or minimal lyrics.", "file": "16_wordplay.csv", "default": "Heavy Punchlines"}),
        ("storytelling", {"label": "Story style", "legacy_label": "Storytelling", "help": "Chooses whether lyrics are mood-first, one scene, linear, multi-perspective, or cinematic.", "file": "17_storytelling.csv", "default": "Scene-Based Street Fiction"}),
        ("adlibs", {"label": "Extra vocal shouts / phrases", "legacy_label": "Ad-Libs", "help": "Adds or removes short echoes, crew replies, whispers, reactions, and vocal textures.", "file": "18_adlibs.csv", "default": "Frequent Hype Ad-Libs"}),
        ("song_length", {"label": "Approximate song length", "legacy_label": "Song Length", "help": "Targets the overall duration by changing section count and repetition.", "file": "19_song_length.csv", "default": "About 3 Minutes"}),
    )
)


CHOICE_DISPLAY_ALIASES: Dict[str, Dict[str, str]] = {
    "aggression": {
        "Soft": "Soft — gentle, low-impact performance",
        "Controlled": "Controlled — strong but held in reserve",
        "Strong": "Strong — forceful and confident",
        "None": "No aggression — calm and non-confrontational",
        "Low Simmer": "Low simmer — restrained tension",
        "Moderate": "Moderate — clear energy without overpowering the song",
        "Maximum Impact": "Maximum — explosive, controlled impact",
        "Hard-Hitting": "Hard-hitting — heavy drums and forceful delivery",
        "Explosive": "Explosive — sudden high-impact peaks",
        "Relentless": "Relentless — sustained maximum pressure",
        "Escalating": "Escalating — builds steadily toward the peak",
        "Breakdown Peak": "Peak at the breakdown",
        "Dynamic Swells": "Rise and fall in intensity",
    },
    "darkness": {
        "Bright": "Bright — open, positive emotional colour",
        "Balanced": "Balanced — equal shadow and hope",
        "Dark": "Dark — tense and emotionally shadowed",
        "Very Dark": "Very dark — bleak and oppressive",
        "Sunlit": "Sunlit — warm, clear, and optimistic",
        "Warm Twilight": "Warm twilight — reflective, soft-edged melancholy",
        "Neutral": "Neutral — no strong bright or dark bias",
        "Moody": "Moody — brooding but not hopeless",
        "Noir": "Noir — smoky, tense, morally grey",
        "Bleak": "Bleak — cold, defeated, and low on hope",
        "Horror": "Horror-dark — threatening and unsettling",
        "Abyssal": "Abyssal — overwhelmingly dark",
        "Dark with Hope": "Dark, but with a hopeful release",
        "Dark to Triumphant": "Dark opening — ends in triumph",
        "Bright to Dark": "Bright opening — descends into darkness",
    },
    "rhyme_density": {
        "None / Free Verse": "Free verse — no regular rhyme pattern",
        "Balanced": "Balanced — clear regular rhymes",
        "Dense Multisyllabic": "Dense — multisyllabic and internal rhymes",
        "Technical Maximum": "Very dense — technical rhyme webs",
        "Maximum Rhyme Chains": "Maximum — multi-line rhyme chains",
        "Variable by Section": "Variable — denser verses, simpler hooks",
        "Loose and Conversational": "Loose — natural speech with occasional rhyme",
        "Sparse End Rhyme": "Sparse — a few end rhymes per section",
        "Simple Couplets": "Simple — paired end-rhyme couplets",
        "Pop Regular": "Pop-regular — predictable, singable rhyme pattern",
        "Internal Accents": "Internal accents — light rhymes inside lines",
        "Technical Dense": "Technical — dense internal and multisyllabic rhymes",
        "Hook Simple / Verses Dense": "Simple hook, denser technical verses",
        "Melodic Repetition": "Melody-first — repetition matters more than rhyme",
    },
    "explicitness": {
        "Clean": "Clean — no profanity",
        "Mostly Clean": "Mostly clean — only very mild language",
        "Moderate": "Moderate — occasional strong language",
        "Explicit": "Explicit — purposeful strong profanity",
        "Very Explicit": "Very explicit — frequent natural profanity and adult language",
        "Family Friendly": "Family friendly — safe for all ages",
        "Clean but Intense": "Clean but intense — forceful without profanity",
        "Radio Edit": "Radio edit — censor or replace strong language",
        "Uncensored": "Uncensored — frequent natural profanity even from a clean idea",
        "Comedic Explicit": "Comedic explicit — bawdy jokes and profane punchlines",
        "Dark Mature": "Dark mature — adult detail with selective strong language",
        "Instrumental": "Instrumental — no lyrical words",
    },
    "wordplay": {
        "Direct": "Direct — plain, forceful statements",
        "Selective Metaphor": "Selective metaphor — mostly clear with a few images",
        "Heavy Punchlines": "Punchline-heavy — frequent quotable payoffs",
        "Layered Literary": "Layered literary — dense imagery and subtext",
        "Witty and Playful": "Witty — playful turns of phrase",
        "Plainspoken": "Plainspoken — natural everyday language",
        "Visual Metaphor": "Visual metaphor — concrete cinematic comparisons",
        "Extended Metaphor": "Extended metaphor — one image developed across sections",
        "Double Entendres": "Double meanings — two readable interpretations",
        "Triple Entendres": "Triple meanings — highly layered punchlines",
        "Battle-Rap Punchlines": "Battle-rap punchlines — sharp setups and attacks",
        "Story-First": "Story-first — clarity over clever phrasing",
        "Surreal Imagery": "Surreal imagery — dreamlike, unexpected combinations",
        "Comedic Bars": "Comedic bars — jokes, misdirection, and punchlines",
        "Technical References": "Technical references — precise specialist details",
        "Poetic Symbolism": "Poetic symbolism — recurring symbols and subtext",
        "Minimal Lyrics": "Minimal lyrics — very few repeated words",
    },
    "storytelling": {
        "Minimal Narrative": "Mood-first — only a loose story thread",
        "No Narrative": "No story — focus on mood and statements",
        "Single Moment": "One vivid moment or scene",
        "Vignette Chain": "Linked snapshots across several scenes",
        "Cinematic Epic": "Big cinematic story — builds in acts",
        "Documentary Detail": "Realistic detail — observational and specific",
        "Scene-Based Street Fiction": "Street-fiction scenes — vivid fictional moments",
        "Linear Story": "Linear story — events unfold in time order",
        "Flashback Structure": "Flashbacks — move between present and past",
        "Character Portrait": "Character portrait — focus on one person's inner world",
        "Three-Act Story": "Three-act story — setup, crisis, resolution",
        "Unreliable Narrator": "Unreliable narrator — perspective may be misleading",
        "Dual Perspective": "Two perspectives — alternate viewpoints",
        "Dialogue Scene": "Dialogue scene — characters speak to each other",
        "Reverse Chronology": "Reverse chronology — reveal events backward",
        "Circular Ending": "Circular ending — finish where the story began",
        "Concept Album Chapter": "Concept chapter — one part of a larger world",
        "Mythic Allegory": "Mythic allegory — symbolic legend-like story",
    },
    "adlibs": {
        "None": "None — no extra shouts or phrases",
        "Completely Dry": "Completely dry — lead vocal only",
        "Sparse Accent Ad-Libs": "Sparse — a few accents at key moments",
        "Frequent Hype Ad-Libs": "Frequent — hype replies and echoes",
        "Callout Layers": "Layered callouts — lead and response phrases",
        "Atmospheric Vocal Textures": "Atmospheric textures — breaths, hums, and distant layers",
        "Whispered Echoes": "Whispered echoes — quiet repeats behind the lead",
        "Crew Responses": "Crew responses — group replies to lead lines",
        "Call-and-Response": "Call and response — regular lead/group exchanges",
        "Comedic Reactions": "Comedic reactions — laughs, asides, and punchline replies",
        "Rage Shouts": "Rage shouts — clipped aggressive exclamations",
        "Gospel Responses": "Gospel responses — choir affirmations and replies",
        "Dancehall Hype": "Dancehall hype — energetic sound-system callouts",
        "Producer-Tag Style": "Producer-tag style — sparse signature callouts",
        "Ambient Vocal Textures": "Ambient vocal layers — wordless background colour",
    },
    "hook_style": {
        "No Vocal Hook": "Instrumental hook — no vocal chorus",
        "No Repeated Hook": "No repeated chorus — through-composed",
        "Title Repetition": "Repeat the song title as the hook",
        "Question and Answer": "Question line followed by a repeated answer",
    },
    "production_style": {
        "Organic Live Room": "Natural live room — human, warm, minimally polished",
        "Raw Underground": "Raw underground — dry, saturated, deliberately rough",
        "Ultra-Wide Atmospheric": "Wide atmospheric — deep space and long tails",
        "Polished Radio Pop": "Polished radio — bright, clear, chorus-forward",
    },
    "song_length": {
        "About 90 Seconds": "Target ~1:30",
        "About 2 Minutes": "Target ~2:00",
        "About 2.5 Minutes": "Target ~2:30",
        "About 3 Minutes": "Target ~3:00",
        "About 3.5 Minutes": "Target ~3:30",
        "About 4 Minutes": "Target ~4:00",
        "About 4.5 Minutes": "Target ~4:30",
        "About 5 Minutes": "Target ~5:00 — MiniMax may finish earlier",
        "About 1 Minute": "Target ~1:00",
        "About 30 Seconds": "Target ~0:30",
        "About 45 Seconds": "Target ~0:45",
        "About 75 Seconds": "Target ~1:15",
        "Short Radio Edit": "Short radio edit — compact intro, verses, and hook",
        "Extended Club Mix": "Extended club mix — longer intro, breaks, and outro",
    },
}


REFERENCE_TRAIT_CATEGORIES: "OrderedDict[str, Tuple[str, ...]]" = OrderedDict(
    (
        ("era and scene", ("genre", "subgenre_era")),
        ("vocal character and delivery", ("vocal_gender_type", "vocal_delivery")),
        ("instrument, drum, guitar, bass and synth tone", ("instruments",)),
        ("tempo tendency and groove", ("bpm_tempo",)),
        ("arrangement and section habits", ("song_structure",)),
        ("hook tendencies", ("hook_style",)),
        ("dynamics and emotional arc", ("mood", "aggression", "darkness")),
        ("mix and production character", ("production_style",)),
    )
)


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _safe_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(float(value))
    except (TypeError, ValueError, OverflowError):
        parsed = int(default)
    return max(int(minimum), min(int(maximum), parsed))


def _safe_float(value: Any, default: float, minimum: float, maximum: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError, OverflowError):
        parsed = float(default)
    if parsed != parsed or parsed in (float("inf"), float("-inf")):
        parsed = float(default)
    return max(float(minimum), min(float(maximum), parsed))


def _safe_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return bool(default)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1", "yes", "on"}:
            return True
        if lowered in {"false", "0", "no", "off", ""}:
            return False
    return bool(value)


def _ollama_model_catalog(timeout: float = 1.5) -> Dict[str, Any]:
    """Return loopback Ollama models with portable friendly labels."""

    request = Request(OLLAMA_TAGS_URL, method="GET")
    try:
        with urlopen(request, timeout=max(0.2, float(timeout))) as response:
            raw = response.read(4 * 1024 * 1024 + 1)
    except (HTTPError, URLError, TimeoutError, OSError) as error:
        return {
            "available": False,
            "runtime": "Ollama is not reachable at 127.0.0.1:11434.",
            "error": str(error),
            "models": [],
            "missing_recommended": list(OLLAMA_RECOMMENDED),
        }
    if len(raw) > 4 * 1024 * 1024:
        raise RuntimeError("Ollama returned an unexpectedly large model list.")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("Ollama returned an invalid model list.") from error
    rows = payload.get("models", []) if isinstance(payload, Mapping) else []
    names = []
    for row in rows if isinstance(rows, list) else []:
        name = _clean_text(row.get("name") if isinstance(row, Mapping) else "")
        if name and name not in names:
            names.append(name)

    def installed_name(alias: str) -> str:
        alias_folded = alias.casefold()
        return next(
            (
                name for name in names
                if name.casefold() == alias_folded or name.casefold() == f"{alias_folded}:latest"
            ),
            "",
        )

    models: List[Dict[str, Any]] = []
    missing = []
    recommended_names = set()
    for friendly, alias in OLLAMA_RECOMMENDED.items():
        actual = installed_name(alias)
        if actual:
            recommended_names.add(actual)
            models.append(
                {
                    "name": actual,
                    "label": f"{friendly} — {actual}",
                    "friendly": friendly,
                    "recommended": True,
                    "installed": True,
                }
            )
        else:
            missing.append(friendly)
    for name in names:
        if name in recommended_names:
            continue
        models.append(
            {
                "name": name,
                "label": f"LOCAL — {name}",
                "friendly": "LOCAL",
                "recommended": False,
                "installed": True,
            }
        )
    return {
        "available": True,
        "runtime": f"Ollama is ready with {len(names)} local model(s).",
        "models": models,
        "missing_recommended": missing,
    }


def _duration_section_plan(base_plan: Any, seconds: Any) -> str:
    """Turn a target duration into concrete writer structure without claiming exact output."""

    duration = _safe_float(seconds, 180.0, 15.0, 300.0)
    if duration >= 285:
        guidance = (
            "TARGET ~5:00 (MiniMax may still finish early): do not stop after a normal three-minute arc. "
            "Write a long-form arrangement with at least 10 substantial tagged sections: developed intro, "
            "three distinct verses, repeated full choruses, bridge or breakdown, 24-32 bar instrumental/solo "
            "breathing room, an expanded final chorus, and a deliberate outro. Aim for roughly 650-900 "
            "performable lyric words plus instrumental space."
        )
    elif duration >= 255:
        guidance = (
            "TARGET ~4:30: use at least nine substantial sections, three vocal movements, a bridge, an "
            "instrumental passage, a full final return, and a resolved outro."
        )
    elif duration >= 225:
        guidance = (
            "TARGET ~4:00: use at least eight substantial sections with three vocal movements, a contrasting "
            "bridge or instrumental turn, repeated hooks, and a developed ending."
        )
    elif duration >= 195:
        guidance = (
            "TARGET ~3:30: use at least seven substantial sections with two developed verses, repeated hooks, "
            "a bridge or instrumental turn, and a complete outro."
        )
    elif duration >= 165:
        guidance = "TARGET ~3:00: deliver two full verses, repeated hooks, a contrasting middle, and a resolved outro."
    elif duration >= 135:
        guidance = "TARGET ~2:30: keep the arc concise but complete with two vocal sections, hook returns, and an ending."
    elif duration >= 105:
        guidance = "TARGET ~2:00: use two compact vocal sections, a memorable hook return, and a short ending."
    elif duration >= 80:
        guidance = "TARGET ~1:30: reach the hook quickly, develop one clear verse, repeat the payoff, and end cleanly."
    else:
        guidance = f"TARGET ~{int(round(duration))} seconds: use a compact hook-first structure with no wasted setup."
    return "\n".join(part for part in (_clean_text(base_plan), guidance) if part)


def _read_csv(path: Path) -> List[Dict[str, str]]:
    if not path.is_file():
        raise RuntimeError(f"NovoLoko MiniMax Music 3 library is missing: {path.name}")
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = [
            {str(key or "").strip(): _clean_text(value) for key, value in row.items()}
            for row in csv.DictReader(handle)
        ]
    rows = [row for row in rows if row.get("name") and row.get("prompt")]
    names = [row["name"] for row in rows]
    if not rows or len(names) != len(set(names)):
        raise RuntimeError(f"NovoLoko MiniMax Music 3 library is empty or has duplicate names: {path.name}")
    return rows


def _choice_display(key: str, row: Mapping[str, Any]) -> str:
    name = _clean_text(row.get("name"))
    return CHOICE_DISPLAY_ALIASES.get(key, {}).get(name, name)


def _reference_variant_name(reference: Any, mode: str) -> str:
    return f"{_clean_text(reference)} — {mode}"


def _requires_active_explicit_language(value: Any) -> bool:
    text = _clean_text(value).casefold()
    return any(
        marker in text
        for marker in (
            "frequent natural profanity",
            "without radio-edit restraint",
            "even when the short idea contains no profanity",
        )
    )


def _explicit_language_guard(value: Any) -> str:
    if not _requires_active_explicit_language(value):
        return ""
    return (
        "NON-NEGOTIABLE LANGUAGE POLICY: The selected Very Explicit / Uncensored control requires "
        "frequent natural profanity and unmistakably explicit adult language throughout this fictional song, "
        "even though the clean song idea contains no profanity. Do not return a clean or merely suggestive draft; "
        "keep the language purposeful, voice-appropriate, and within fictional-content safety boundaries."
    )


_EXPLICIT_LANGUAGE_PATTERN = re.compile(
    r"\b(?:fuck\w*|shit\w*|bitch\w*|motherfuck\w*|asshole\w*|bastard\w*|cunt\w*|cock\w*|dick\w*|puss(?:y|ies)|whore\w*)\b",
    flags=re.IGNORECASE,
)


def _contains_explicit_language(value: Any) -> bool:
    return bool(_EXPLICIT_LANGUAGE_PATTERN.search(_clean_text(value)))


def _parse_control_overrides(value: Any) -> set[str]:
    if isinstance(value, str):
        try:
            value = json.loads(value or "[]")
        except (TypeError, ValueError, json.JSONDecodeError):
            value = []
    if isinstance(value, Mapping):
        value = [key for key, enabled in value.items() if _safe_bool(enabled, False)]
    if not isinstance(value, (list, tuple, set)):
        return set()
    return {str(key) for key in value if str(key) in CATEGORY_SPECS}


def _reference_dna(
    resolved: Mapping[str, Mapping[str, str]],
    mode: str,
    overrides: set[str],
) -> Tuple[str, List[str], List[str]]:
    """Build artist-neutral descriptive DNA from the final resolved controls."""

    trait_lines: List[str] = []
    locked: List[str] = []
    influenced: List[str] = []
    for trait, keys in REFERENCE_TRAIT_CATEGORIES.items():
        if mode == "Like" and trait not in {
            "era and scene", "vocal character and delivery",
            "instrument, drum, guitar, bass and synth tone", "mix and production character",
        }:
            continue
        prompts = [resolved[key].get("prompt", "") for key in keys if resolved.get(key, {}).get("prompt")]
        if not prompts:
            continue
        trait_lines.append(f"- {trait}: {' '.join(prompts)}")
        if mode == "Clone" and not any(key in overrides for key in keys):
            locked.append(trait)
        else:
            influenced.append(trait)
    if not trait_lines:
        return "", locked, influenced
    if mode == "Clone":
        heading = (
            "Reference DNA priority (very high). Reference mode: Clone. Apply very strong descriptive steering and keep every non-overridden DNA "
            "trait dominant. Manual controls replace only their matching trait. Do not mention, imitate, or "
            "insert any artist name. Locked Reference DNA:\n"
        )
    else:
        heading = (
            "Reference DNA priority (broad and flexible). Reference mode: Like. Preserve this recognisable broad descriptive DNA, but allow original choices "
            "in arrangement, dynamics, hooks, melody and production. Manual controls take priority. Do not mention, "
            "imitate, or insert any artist name. Influenced Reference DNA:\n"
        )
    return heading + "\n".join(trait_lines), locked, influenced


def _resolved_report_display(key: str, row: Mapping[str, str]) -> str:
    choice = _clean_text(row.get("_choice"))
    display = _choice_display(key, row)
    if choice == RANDOM_OPTION:
        return f"{RANDOM_OPTION} -> {display}"
    if choice == CUSTOM_OPTION:
        custom = _clean_text(row.get("_custom"))
        return f"{CUSTOM_OPTION} -> {custom}" if custom else _clean_text(row.get("_report")) or CUSTOM_OPTION
    if choice == NONE_OPTION or not row.get("prompt"):
        return f"{NONE_OPTION} (no prompt contribution)"
    return display


def load_music_catalog() -> "OrderedDict[str, List[Dict[str, str]]]":
    return OrderedDict(
        (key, _read_csv(MUSIC_CSV_ROOT / spec["file"]))
        for key, spec in CATEGORY_SPECS.items()
    )


def _load_builtin_music_presets() -> "OrderedDict[str, Dict[str, str]]":
    path = MUSIC_CSV_ROOT / "20_presets.csv"
    if not path.is_file():
        raise RuntimeError("NovoLoko MiniMax Music 3 preset library is missing: 20_presets.csv")
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    presets: "OrderedDict[str, Dict[str, str]]" = OrderedDict()
    for source in rows:
        row = {str(key or "").strip(): _clean_text(value) for key, value in source.items()}
        name = row.get("name", "")
        if not name or name in presets:
            raise RuntimeError("NovoLoko MiniMax Music 3 presets require unique non-empty names.")
        missing = [key for key in CATEGORY_SPECS if not row.get(key)]
        if missing:
            raise RuntimeError(f"Music preset {name!r} is missing: {', '.join(missing)}")
        presets[name] = row
    if not presets:
        raise RuntimeError("NovoLoko MiniMax Music 3 preset library is empty.")

    reference_path = MUSIC_CSV_ROOT / "21_reference_presets.csv"
    if reference_path.is_file():
        with reference_path.open("r", encoding="utf-8-sig", newline="") as handle:
            reference_rows = list(csv.DictReader(handle))
        for source in reference_rows:
            row = {str(key or "").strip(): _clean_text(value) for key, value in source.items()}
            name = row.get("name", "")
            base_name = row.get("base_preset", "")
            if not name or name in presets:
                raise RuntimeError("NovoLoko reference presets require unique non-empty names.")
            if base_name not in presets:
                raise RuntimeError(f"Reference preset {name!r} has unknown base preset {base_name!r}.")
            merged = dict(presets[base_name])
            merged.update({key: value for key, value in row.items() if value})
            merged["name"] = name
            merged["base_preset"] = base_name
            reference = _clean_text(merged.get("reference"))
            if not reference:
                presets[name] = merged
                continue

            variant_names = {mode: _reference_variant_name(reference, mode) for mode in REFERENCE_MODES}
            for mode in REFERENCE_MODES:
                variant_name = variant_names[mode]
                if variant_name in presets:
                    raise RuntimeError(f"NovoLoko reference variant name is duplicated: {variant_name!r}.")
                variant = dict(merged)
                variant["name"] = variant_name
                variant["reference_mode"] = mode
                variant["reference_strength"] = "Very strong / locked" if mode == "Clone" else "Recognisable / flexible"
                variant["legacy_name"] = name
                variant["description"] = (
                    f"{merged.get('description', '')} "
                    + (
                        "Clone locks the detailed era, vocal, band, tempo, arrangement, dynamics, hook and mix DNA unless you override a matching control."
                        if mode == "Clone"
                        else "Like keeps recognisable broad DNA while allowing more freedom in arrangement, dynamics, hooks and production."
                    )
                ).strip()
                presets[variant_name] = variant

            # Keep every v4.6.1 artist preset name as a backend alias so saved
            # workflows and recipes restore. The custom browser hides these
            # decorative legacy labels and migrates them to the Like variant.
            legacy = dict(merged)
            legacy["reference_mode"] = "Legacy"
            legacy["reference_strength"] = "Legacy alias"
            legacy["__hidden"] = True
            legacy["__alias_target"] = variant_names["Like"]
            presets[name] = legacy

    catalog = load_music_catalog()
    valid_names = {key: {item["name"] for item in rows} for key, rows in catalog.items()}
    for name, row in presets.items():
        missing = [key for key in CATEGORY_SPECS if not row.get(key)]
        if missing:
            raise RuntimeError(f"Music preset {name!r} is missing: {', '.join(missing)}")
        invalid = [key for key in CATEGORY_SPECS if row[key] not in valid_names[key]]
        if invalid:
            details = ", ".join(f"{key}={row[key]!r}" for key in invalid)
            raise RuntimeError(f"Music preset {name!r} references unknown catalog choices: {details}")
    return presets


def _user_data_root() -> Path:
    """Return update-safe per-user storage without creating it during schema reads."""

    override = _clean_text(os.environ.get("NOVOLOKO_USER_DATA_DIR", ""))
    if override:
        return Path(override).expanduser().resolve()
    try:
        import folder_paths

        getter = getattr(folder_paths, "get_user_directory", None)
        if callable(getter):
            return (Path(getter()).resolve() / "novoloko")
    except Exception:
        pass
    return (Path.home() / ".novoloko").resolve()


def _user_presets_path() -> Path:
    return _user_data_root() / "music3" / "user_presets.json"


def _read_user_preset_document() -> Dict[str, Any]:
    path = _user_presets_path()
    if not path.is_file():
        return {"schema": USER_PRESET_SCHEMA, "presets": []}
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError) as error:
        print(f"[NovoLoko Music 3] Ignoring unreadable user preset file {path}: {error}")
        return {"schema": USER_PRESET_SCHEMA, "presets": []}
    if not isinstance(document, Mapping) or not isinstance(document.get("presets"), list):
        print(f"[NovoLoko Music 3] Ignoring invalid user preset document: {path}")
        return {"schema": USER_PRESET_SCHEMA, "presets": []}
    return {"schema": USER_PRESET_SCHEMA, "presets": list(document["presets"])}


def _normalise_user_preset(source: Any) -> Dict[str, Any] | None:
    if not isinstance(source, Mapping):
        return None
    name = _clean_text(source.get("name"))
    selections = source.get("selections")
    custom_values = source.get("custom_values")
    if not name or not isinstance(selections, Mapping):
        return None
    normalised_selections = {
        key: _clean_text(selections.get(key, NONE_OPTION)) or NONE_OPTION
        for key in CATEGORY_SPECS
    }
    normalised_custom = {
        key: _clean_text(custom_values.get(key, "")) if isinstance(custom_values, Mapping) else ""
        for key in CATEGORY_SPECS
    }
    return {
        "name": name,
        "selections": normalised_selections,
        "custom_values": normalised_custom,
        "randomize_all": _safe_bool(source.get("randomize_all"), False),
        "allow_random_none": _safe_bool(source.get("allow_random_none"), False),
        "seed": _safe_int(source.get("seed", source.get("resolved_seed", 0)), 0, 0, SEED_MAX),
        "seed_after_run": (
            _clean_text(source.get("seed_after_run"))
            if _clean_text(source.get("seed_after_run")) in SEED_AFTER_RUN_MODES
            else "Fixed"
        ),
        "random_preset_scope": (
            _clean_text(source.get("random_preset_scope"))
            if _clean_text(source.get("random_preset_scope")) in RANDOM_PRESET_SCOPES
            else "Off"
        ),
        "random_preset_filter": _clean_text(source.get("random_preset_filter")),
        "created_at": _clean_text(source.get("created_at")),
        "updated_at": _clean_text(source.get("updated_at")),
    }


def load_user_music_presets() -> "OrderedDict[str, Dict[str, Any]]":
    presets: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()
    builtin_names = set(_load_builtin_music_presets())
    for source in _read_user_preset_document()["presets"]:
        preset = _normalise_user_preset(source)
        if preset is None or preset["name"] in builtin_names or preset["name"] in presets:
            continue
        presets[preset["name"]] = preset
    return presets


def _write_user_music_presets(presets: Sequence[Mapping[str, Any]]) -> None:
    path = _user_presets_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    document = {"schema": USER_PRESET_SCHEMA, "presets": list(presets)}
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(document, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    os.replace(temporary, path)


def load_music_presets() -> "OrderedDict[str, Dict[str, Any]]":
    presets: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()
    for name, row in _load_builtin_music_presets().items():
        presets[name] = {**row, "__source": "built-in", "__custom_values": {}}
    for name, preset in load_user_music_presets().items():
        presets[name] = {
            "name": name,
            **preset["selections"],
            "__source": "user",
            "__custom_values": preset["custom_values"],
            "__policy": {
                "randomize_all": preset["randomize_all"],
                "allow_random_none": preset["allow_random_none"],
                "seed": preset["seed"],
                "seed_after_run": preset["seed_after_run"],
                "random_preset_scope": preset["random_preset_scope"],
                "random_preset_filter": preset["random_preset_filter"],
            },
        }
    return presets


def _row_map(rows: List[Dict[str, str]]) -> Dict[str, Dict[str, str]]:
    return {row["name"]: row for row in rows}


def _seeded_choice(seed: int, key: str, rows: List[Dict[str, str]]) -> Dict[str, str]:
    digest = hashlib.sha256(f"NovoLoko Music 3|{seed}|{key}".encode("utf-8")).digest()
    chooser = random.Random(int.from_bytes(digest[:8], "big"))
    weights = [_safe_float(row.get("_random_weight", 1.0), 1.0, 0.0, 1000.0) for row in rows]
    if any(weight != 1.0 for weight in weights) and sum(weights) > 0:
        return chooser.choices(rows, weights=weights, k=1)[0]
    return rows[chooser.randrange(len(rows))]


def _preset_random_weight(row: Mapping[str, Any]) -> float:
    """Keep preserved novelty presets possible, but make practical music the norm."""
    folder = _default_preset_folder(row).casefold()
    name = _clean_text(row.get("name") or row.get("__name")).casefold()
    novelty = "fun hybrids & experiments" in folder or any(
        marker in name for marker in ("cuda out of memory", "what did i generate", "gregorian drill opera")
    )
    return 1.0 if novelty else 12.0


def _none_selection(choice: str = NONE_OPTION) -> Dict[str, str]:
    return {
        "name": NONE_OPTION,
        "prompt": "",
        "_choice": NONE_OPTION,
        "_report": (
            f"{RANDOM_OPTION} -> {NONE_OPTION} (no prompt contribution)"
            if choice == RANDOM_OPTION
            else f"{NONE_OPTION} (no prompt contribution)"
        ),
    }


def _custom_selection(text: Any, choice: str = CUSTOM_OPTION) -> Dict[str, str]:
    custom = _clean_text(text)
    if not custom:
        return {
            "name": CUSTOM_OPTION,
            "prompt": "",
            "_choice": CUSTOM_OPTION,
            "_report": f"{CUSTOM_OPTION} (empty; no prompt contribution)",
        }
    prefix = f"{RANDOM_OPTION} -> " if choice == RANDOM_OPTION else ""
    return {
        "name": custom,
        "prompt": custom,
        "_choice": CUSTOM_OPTION,
        "_custom": custom,
        "_report": f"{prefix}{CUSTOM_OPTION} {custom}",
    }


def _catalog_selection(row: Mapping[str, Any], choice: str | None = None) -> Dict[str, str]:
    selected = {str(key): _clean_text(value) for key, value in row.items()}
    selected["_choice"] = selected.get("name", "")
    selected["_report"] = (
        f"{RANDOM_OPTION} -> {selected.get('name', '')}"
        if choice == RANDOM_OPTION
        else selected.get("name", "")
    )
    return selected


def _resolve_category_choice(
    seed: int,
    key: str,
    rows: List[Dict[str, str]],
    requested: Any,
    custom_text: Any,
    allow_random_none: bool,
) -> Dict[str, str]:
    choice = _clean_text(requested) or NONE_OPTION
    by_name = _row_map(rows)
    if choice == NONE_OPTION:
        return _none_selection()
    if choice == CUSTOM_OPTION:
        return _custom_selection(custom_text)
    if choice == RANDOM_OPTION:
        candidates: List[Dict[str, str]] = [
            _catalog_selection(row, RANDOM_OPTION) for row in rows
        ]
        if _clean_text(custom_text):
            candidates.append(_custom_selection(custom_text, RANDOM_OPTION))
        if allow_random_none:
            candidates.append(_none_selection(RANDOM_OPTION))
        return _seeded_choice(seed, key, candidates)
    row = by_name.get(choice)
    return _catalog_selection(row) if row is not None else {}


def _clip_token(clip: Any) -> Tuple[Any, ...]:
    model = getattr(clip, "cond_stage_model", None)
    return (
        id(model) if model is not None else id(clip),
        type(model).__module__ if model is not None else type(clip).__module__,
        type(model).__qualname__ if model is not None else type(clip).__qualname__,
    )


def _strip_model_wrapper(value: Any) -> str:
    if isinstance(value, (list, tuple)):
        value = value[0] if value else ""
    text = _clean_text(value)
    text = re.sub(r"^```(?:text|markdown)?\s*|\s*```$", "", text, flags=re.IGNORECASE | re.DOTALL).strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in {'"', "'"}:
        text = text[1:-1].strip()
    return text


def _sanitise_filename_component(value: Any, default: str = "Untitled", limit: int = 80) -> str:
    """Return a readable Windows-safe filename component."""

    text = _clean_text(value)
    text = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", text)
    text = re.sub(r"\s+", "_", text)
    text = re.sub(r"_+", "_", text).strip(" ._")
    if not text:
        text = default
    if text.split(".", 1)[0].upper() in WINDOWS_RESERVED_NAMES:
        text = f"_{text}"
    return text[: max(1, int(limit))].rstrip(" ._") or default


def _safe_output_subfolder(value: Any) -> Path:
    raw = _clean_text(value or DEFAULT_AUDIO_FOLDER).replace("\\", "/").strip("/")
    if not raw or re.match(r"^[A-Za-z]:", raw):
        raw = DEFAULT_AUDIO_FOLDER
    parts = [part for part in raw.split("/") if part not in {"", "."}]
    if not parts or any(part == ".." for part in parts):
        raise ValueError("Save folder must stay inside the ComfyUI output directory.")
    return Path(*(_sanitise_filename_component(part, "audio", 64) for part in parts))


def _output_root() -> Path:
    try:
        import folder_paths  # ComfyUI runtime dependency; intentionally lazy for import-safe tests.
    except ImportError as error:  # pragma: no cover - exercised only outside ComfyUI
        raise RuntimeError("ComfyUI folder_paths is unavailable; the audio saver must run inside ComfyUI.") from error
    return Path(folder_paths.get_output_directory()).resolve()


def _normalise_audio_batch(audio: Mapping[str, Any]):
    if not isinstance(audio, Mapping) or "waveform" not in audio or "sample_rate" not in audio:
        raise ValueError("NovoLoko Save Audio requires a ComfyUI AUDIO input with waveform and sample_rate.")
    waveform = audio["waveform"]
    if hasattr(waveform, "detach"):
        waveform = waveform.detach()
    if hasattr(waveform, "cpu"):
        waveform = waveform.cpu()
    if hasattr(waveform, "float"):
        waveform = waveform.float()
    if hasattr(waveform, "numpy"):
        waveform = waveform.numpy()
    import numpy as np

    array = np.asarray(waveform, dtype=np.float32)
    if array.ndim == 2:
        array = array[None, ...]
    if array.ndim != 3 or array.shape[1] not in {1, 2}:
        raise ValueError("NovoLoko audio saver expects waveform shape [batch, mono/stereo, samples].")
    sample_rate = _safe_int(audio["sample_rate"], 44100, 8000, 384000)
    return array, sample_rate


def _write_pcm24_wav(path: Path, channels_first, sample_rate: int) -> None:
    import numpy as np

    samples = np.asarray(channels_first, dtype=np.float32)
    samples = np.clip(samples, -1.0, 1.0).T
    signed = np.rint(samples * 8388607.0).astype(np.int32)
    packed = np.empty((*signed.shape, 3), dtype=np.uint8)
    packed[..., 0] = signed & 0xFF
    packed[..., 1] = (signed >> 8) & 0xFF
    packed[..., 2] = (signed >> 16) & 0xFF
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(int(samples.shape[1]))
        handle.setsampwidth(3)
        handle.setframerate(int(sample_rate))
        handle.writeframes(packed.tobytes())


def _find_ffmpeg() -> str:
    configured = _clean_text(os.environ.get("NOVOLOKO_FFMPEG", ""))
    candidates = [
        configured,
        shutil.which("ffmpeg") or "",
        str(Path.home() / "Documents" / "ffmpeg" / "ffmpeg_folder" / "bin" / "ffmpeg.exe"),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return str(Path(candidate))
    raise RuntimeError(
        "FLAC, MP3, and OGG saving needs FFmpeg. Install FFmpeg on PATH or set NOVOLOKO_FFMPEG to ffmpeg.exe. WAV saving works without it."
    )


def _transcode_audio(wav_source: Path, destination: Path, audio_format: str) -> None:
    spec = AUDIO_FORMATS.get(audio_format)
    if spec is None:
        raise ValueError(f"Unsupported audio format: {audio_format}")
    command = [
        _find_ffmpeg(), "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(wav_source), *spec[1], str(destination),
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode:
        detail = _clean_text(result.stderr) or f"FFmpeg exited with code {result.returncode}"
        raise RuntimeError(f"Could not save {audio_format}: {detail}")


def _append_wave_info(path: Path, tags: Mapping[str, Any]) -> None:
    """Append a compact standard RIFF INFO list without touching the PCM data."""

    chunks = []
    for tag, value in tags.items():
        payload = _clean_text(value).encode("utf-8", errors="replace")[:4095] + b"\x00"
        if len(payload) % 2:
            payload += b"\x00"
        chunks.append(tag.encode("ascii")[:4].ljust(4, b" ") + struct.pack("<I", len(payload)) + payload)
    if not chunks:
        return
    info = b"INFO" + b"".join(chunks)
    if len(info) % 2:
        info += b"\x00"
    block = b"LIST" + struct.pack("<I", len(info)) + info
    with path.open("r+b") as handle:
        if handle.read(4) != b"RIFF":
            raise ValueError("Embedded metadata is only supported for the WAV files written by NovoLoko.")
        handle.seek(0, os.SEEK_END)
        handle.write(block)
        file_size = handle.tell()
        handle.seek(4)
        handle.write(struct.pack("<I", file_size - 8))


def _selection_fields(report: Any) -> "OrderedDict[str, str]":
    fields: "OrderedDict[str, str]" = OrderedDict()
    for line in _clean_text(report).splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = _clean_text(key)
        if key:
            fields[key] = _clean_text(value)
    return fields


def _prompt_snapshot(prompt: Any) -> Dict[str, Any]:
    """Collect literal model/generation values used by this execution prompt."""

    if not isinstance(prompt, Mapping):
        return {}
    keys = {
        "unet_name", "model_name", "clip_name", "text_encoder_name", "vae_name",
        "seed", "noise_seed", "max_duration", "duration", "steps", "cfg",
        "sampler_name", "scheduler", "denoise", "shift", "batch_size",
    }
    found: "OrderedDict[str, List[Any]]" = OrderedDict()
    for node in prompt.values():
        if not isinstance(node, Mapping):
            continue
        inputs = node.get("inputs", {})
        if not isinstance(inputs, Mapping):
            continue
        for key, value in inputs.items():
            if key not in keys or isinstance(value, (list, tuple, dict)):
                continue
            values = found.setdefault(key, [])
            if value not in values:
                values.append(value)
    return {key: values[0] if len(values) == 1 else values for key, values in found.items()}


def _batch_value(value: Any, index: int, count: int) -> Any:
    if isinstance(value, (list, tuple)) and not isinstance(value, (str, bytes)):
        if len(value) == count:
            return value[index]
        if value:
            return value[min(index, len(value) - 1)]
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith("["):
            try:
                parsed = json.loads(stripped)
            except (TypeError, ValueError, json.JSONDecodeError):
                parsed = None
            if isinstance(parsed, list) and len(parsed) == count:
                return parsed[index]
    return value


def _next_track_index(folder: Path, stem: str) -> int:
    pattern = re.compile(rf"^{re.escape(stem)}_(\d+)\.(?:wav|flac|mp3|ogg|txt|json)$", re.IGNORECASE)
    highest = 0
    for path in folder.iterdir():
        match = pattern.match(path.name)
        if match:
            highest = max(highest, int(match.group(1)))
    return highest + 1


def _parse_generation_settings(value: Any) -> Any:
    text = _clean_text(value)
    if not text:
        return {}
    try:
        return json.loads(text)
    except (TypeError, ValueError, json.JSONDecodeError):
        return {"notes": text}


def _metadata_text(record: Mapping[str, Any]) -> str:
    selected = record.get("stacker_selections", {})
    selected_lines = "\n".join(f"{key}: {value}" for key, value in selected.items()) or "Not supplied"
    models = record.get("models", {})
    model_lines = "\n".join(f"{key}: {value}" for key, value in models.items()) or "Not supplied"
    settings = json.dumps(record.get("generation_settings", {}), indent=2, ensure_ascii=False)
    return (
        "NOVOLOKO MINIMAX MUSIC 3 GENERATION\n"
        f"Track: {record.get('title', '')}\n"
        f"Filename: {record.get('filename', '')}\n"
        f"Timestamp: {record.get('timestamp', '')}\n"
        f"Preset: {record.get('preset', '')}\n"
        f"Randomize all: {record.get('randomize_all', '')}\n"
        f"Stacker seed: {record.get('stacker_seed', '')}\n"
        f"Generation seed: {record.get('generation_seed', '')}\n\n"
        f"ORIGINAL SHORT MUSIC IDEA\n{record.get('original_idea', '') or 'Not supplied'}\n\n"
        f"EXACT OPTIONS SELECTED / STACKER\n{selected_lines}\n\n"
        f"LYRIC DIRECTION\n{record.get('lyric_direction', '') or 'Not supplied'}\n\n"
        f"LYRIC ENHANCER BRIEF\n{record.get('lyric_enhancer_brief', '') or 'Not supplied'}\n\n"
        f"FINAL STRUCTURED LYRICS\n{record.get('final_structured_lyrics', '') or 'Not supplied'}\n\n"
        f"FINAL MINIMAX MUSIC CAPTION\n{record.get('final_music_caption', '') or 'Not supplied'}\n\n"
        f"MODELS\n{model_lines}\n\n"
        f"GENERATION SETTINGS\n{settings}\n"
    )


def _cleanup_music_models() -> str:
    actions = []
    _MusicTextGenerator._cache.clear()
    actions.append("NovoLoko text cache cleared")
    try:
        from comfy import model_management
        model_management.unload_all_models()
        model_management.soft_empty_cache()
        actions.append("ComfyUI models unloaded")
    except (ImportError, AttributeError, RuntimeError) as error:
        actions.append(f"ComfyUI cleanup unavailable: {error}")
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            actions.append("CUDA cache emptied")
    except (ImportError, RuntimeError):
        pass
    return "; ".join(actions)


def _clean_preset_name(value: Any) -> str:
    name = re.sub(r"[\x00-\x1f<>:\"/\\|?*]+", " ", _clean_text(value))
    name = re.sub(r"\s+", " ", name).strip(" .")
    if not name:
        raise ValueError("Enter a preset name first.")
    if len(name) > 80:
        raise ValueError("Preset names are limited to 80 characters.")
    if name in {CUSTOM_PRESET, NONE_PRESET, RANDOM_PRESET}:
        raise ValueError("That name is reserved by NovoLoko.")
    return name


def _default_preset_folder(preset: Mapping[str, Any]) -> str:
    if preset.get("__source") == "user":
        return "My Presets"
    name = _clean_text(preset.get("name"))
    if name in {"Gregorian Drill Opera / Holy 808", "CUDA Out of Memory", "What Did I Generate"}:
        return "Genres / Fun Hybrids & Experiments"
    genre = _clean_text(preset.get("genre"))
    if genre in {"Hip-Hop / Rap"}:
        return "Genres / Hip-Hop & Rap"
    if genre in {"Electronic", "House", "Techno", "Trance", "Drum and Bass / Jungle", "Dubstep / Bass Music", "Disco", "Lo-Fi", "Vaporwave"}:
        return "Genres / Electronic & Dance"
    if genre in {"Rock", "Alternative Rock", "Grunge", "Indie Rock", "Progressive Rock", "Hard Rock", "Punk", "Shoegaze", "Metal", "Industrial"}:
        return "Genres / Rock Punk & Metal"
    if genre in {"Pop", "K-Pop", "J-Pop / J-Rock"}:
        return "Genres / Pop"
    if genre in {"R&B / Soul", "Gospel", "Funk"}:
        return "Genres / R&B Soul Gospel & Funk"
    if genre in {"Country", "Folk / Acoustic", "Bluegrass", "Singer-Songwriter", "Blues", "Jazz"}:
        return "Genres / Country Folk Jazz & Blues"
    if genre in {"Reggae / Dancehall", "Latin / Reggaeton", "Afrobeat / Afropop", "World Fusion", "Ska"}:
        return "Genres / Global"
    if genre in {"Orchestral / Cinematic", "Classical", "Ambient", "New Age / Meditation", "Soundtrack / Score"}:
        return "Genres / Cinematic Ambient & Classical"
    if genre == "Spoken Word / Voice":
        return "Spoken Voice / More"
    return "Genres / More"


def _preset_api_rows() -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for name, preset in load_music_presets().items():
        rows.append(
            {
                "name": name,
                "source": preset.get("__source", "built-in"),
                "folder": preset.get("folder") or _default_preset_folder(preset),
                "reference": preset.get("reference", ""),
                "keywords": preset.get("keywords", ""),
                "description": preset.get("description", "Saved user preset." if preset.get("__source") == "user" else ""),
                "base_preset": preset.get("base_preset", ""),
                "reference_mode": preset.get("reference_mode", ""),
                "reference_strength": preset.get("reference_strength", ""),
                "hidden": _safe_bool(preset.get("__hidden"), False),
                "migration_target": preset.get("__alias_target", ""),
                "selections": {key: preset.get(key, NONE_OPTION) for key in CATEGORY_SPECS},
                "custom_values": dict(preset.get("__custom_values", {})),
                "policy": dict(preset.get("__policy", {})),
            }
        )
    return rows


def save_user_music_preset(
    name: Any,
    preset: Any = CUSTOM_PRESET,
    randomize_all: Any = False,
    seed: Any = 0,
    overwrite: Any = False,
    **selections: Any,
) -> Dict[str, Any]:
    clean_name = _clean_preset_name(name)
    if clean_name in _load_builtin_music_presets():
        raise ValueError("Built-in presets cannot be overwritten. Choose another name.")
    existing = load_user_music_presets()
    if clean_name in existing and not _safe_bool(overwrite, False):
        raise FileExistsError(f"User preset {clean_name!r} already exists.")
    resolved, _effective, _randomized, resolved_seed = NovaMusicControls.resolve_selections(
        preset=_clean_text(preset) or CUSTOM_PRESET,
        randomize_all=randomize_all,
        seed=seed,
        **selections,
    )
    now = datetime.now(timezone.utc).isoformat()
    old = existing.get(clean_name, {})
    stored = {
        "name": clean_name,
        "selections": {key: resolved[key].get("_choice", resolved[key]["name"]) for key in CATEGORY_SPECS},
        "custom_values": {key: resolved[key].get("_custom", "") for key in CATEGORY_SPECS},
        "created_at": old.get("created_at") or now,
        "updated_at": now,
        "resolved_seed": resolved_seed,
        "randomize_all": _safe_bool(randomize_all, False),
        "allow_random_none": _safe_bool(selections.get("allow_random_none"), False),
        "seed": _safe_int(seed, 0, 0, SEED_MAX),
        "seed_after_run": (
            _clean_text(selections.get("seed_after_run"))
            if _clean_text(selections.get("seed_after_run")) in SEED_AFTER_RUN_MODES
            else "Fixed"
        ),
        "random_preset_scope": (
            _clean_text(selections.get("random_preset_scope"))
            if _clean_text(selections.get("random_preset_scope")) in RANDOM_PRESET_SCOPES
            else "Off"
        ),
        "random_preset_filter": _clean_text(selections.get("random_preset_filter")),
    }
    ordered = [preset for preset_name, preset in existing.items() if preset_name != clean_name]
    ordered.append(stored)
    _write_user_music_presets(ordered)
    return stored


def rename_user_music_preset(old_name: Any, new_name: Any) -> Dict[str, Any]:
    old = _clean_text(old_name)
    new = _clean_preset_name(new_name)
    presets = load_user_music_presets()
    if old not in presets:
        raise FileNotFoundError("Only saved user presets can be renamed.")
    if new in _load_builtin_music_presets() or (new in presets and new != old):
        raise FileExistsError(f"A preset named {new!r} already exists.")
    now = datetime.now(timezone.utc).isoformat()
    updated: List[Dict[str, Any]] = []
    renamed: Dict[str, Any] | None = None
    for name, preset in presets.items():
        item = dict(preset)
        if name == old:
            item["name"] = new
            item["updated_at"] = now
            renamed = item
        updated.append(item)
    _write_user_music_presets(updated)
    return renamed or {}


def delete_user_music_preset(name: Any) -> str:
    target = _clean_text(name)
    presets = load_user_music_presets()
    if target not in presets:
        raise FileNotFoundError("Only saved user presets can be deleted.")
    _write_user_music_presets([preset for preset_name, preset in presets.items() if preset_name != target])
    return target


def _resolve_library_folder(value: Any = DEFAULT_AUDIO_FOLDER) -> Tuple[Path, str, bool]:
    text = _clean_text(value) or DEFAULT_AUDIO_FOLDER
    candidate = Path(text).expanduser()
    if candidate.is_absolute():
        resolved = candidate.resolve()
        with _EXTERNAL_LIBRARY_LOCK:
            allowed = resolved in _EXTERNAL_LIBRARY_ROOTS
        if not allowed:
            raise PermissionError("Choose this external folder with Browse before loading it.")
        return resolved, str(resolved), True
    relative = _safe_output_subfolder(text)
    output = _output_root()
    resolved = (output / relative).resolve()
    resolved.relative_to(output)
    return resolved, relative.as_posix(), False


def _safe_library_audio(folder: Path, filename: Any) -> Path:
    name = _clean_text(filename)
    if not name or Path(name).name != name:
        raise ValueError("Invalid audio filename.")
    path = (folder / name).resolve()
    path.relative_to(folder.resolve())
    if path.suffix.lower() not in SUPPORTED_AUDIO_EXTENSIONS or not path.is_file():
        raise FileNotFoundError("The selected audio track no longer exists.")
    return path


def _favorites_path(folder: Path) -> Path:
    return folder / FAVORITES_INDEX_NAME


def _load_music_favorites(folder: Path) -> set[str]:
    path = _favorites_path(folder)
    with _FAVORITES_LOCK:
        if not path.is_file():
            return set()
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, TypeError, ValueError):
            return set()
    values = payload.get("favorites", []) if isinstance(payload, Mapping) else []
    return {
        name for name in (_clean_text(value) for value in values if isinstance(value, str))
        if name and Path(name).name == name
    }


def _write_music_favorites(folder: Path, favorites: Sequence[str]) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    path = _favorites_path(folder)
    temporary = path.with_name(f"{path.name}.tmp")
    payload = {
        "schema": FAVORITES_SCHEMA,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "favorites": sorted(
            {
                name for name in (_clean_text(value) for value in favorites)
                if name and Path(name).name == name
            },
            key=str.casefold,
        ),
    }
    with _FAVORITES_LOCK:
        temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        os.replace(temporary, path)


def set_music_library_favorite(folder_value: Any, filename: Any, favorite: Any = True) -> Dict[str, Any]:
    folder, label, _external = _resolve_library_folder(folder_value)
    audio = _safe_library_audio(folder, filename)
    favorites = _load_music_favorites(folder)
    wanted = _safe_bool(favorite, True)
    if wanted:
        favorites.add(audio.name)
    else:
        favorites.discard(audio.name)
    _write_music_favorites(folder, favorites)
    return {"folder": label, "name": audio.name, "favorite": wanted, "favorite_count": len(favorites)}


def _audio_file_info(path: Path) -> Dict[str, Any]:
    stat = path.stat()
    info: Dict[str, Any] = {
        "name": path.name,
        "stem": path.stem,
        "format": path.suffix.lstrip(".").upper(),
        "size_bytes": stat.st_size,
        "modified": stat.st_mtime,
        "duration": None,
        "sample_rate": None,
        "channels": None,
        "has_txt": path.with_suffix(".txt").is_file(),
        "has_json": path.with_suffix(".json").is_file(),
        "mime": mimetypes.guess_type(path.name)[0] or "application/octet-stream",
    }
    if path.suffix.lower() == ".wav":
        try:
            with wave.open(str(path), "rb") as handle:
                rate = handle.getframerate()
                info["sample_rate"] = rate
                info["channels"] = handle.getnchannels()
                info["duration"] = handle.getnframes() / float(rate) if rate else None
        except (OSError, EOFError, wave.Error):
            pass
    if info["duration"] is None:
        try:
            import mutagen

            media = mutagen.File(path)
            media_info = getattr(media, "info", None)
            if media_info is not None:
                info["duration"] = float(getattr(media_info, "length", 0.0) or 0.0) or None
                info["sample_rate"] = int(getattr(media_info, "sample_rate", 0) or 0) or None
                info["channels"] = int(getattr(media_info, "channels", 0) or 0) or None
        except (ImportError, OSError, ValueError, TypeError):
            pass
    if info["duration"] is not None:
        info["duration"] = round(float(info["duration"]), 4)
    return info


def list_music_library(
    folder_value: Any,
    sort_mode: Any = "newest",
    search: Any = "",
    favorites_only: Any = False,
) -> Dict[str, Any]:
    folder, label, external = _resolve_library_folder(folder_value)
    folder.mkdir(parents=True, exist_ok=True)
    query = _clean_text(search).casefold()
    favorites = _load_music_favorites(folder)
    tracks = [
        _audio_file_info(path)
        for path in folder.iterdir()
        if path.is_file()
        and path.suffix.lower() in SUPPORTED_AUDIO_EXTENSIONS
        and (not query or query in path.name.casefold())
        and (not _safe_bool(favorites_only, False) or path.name in favorites)
    ]
    for track in tracks:
        track["favorite"] = track["name"] in favorites
    mode = _clean_text(sort_mode).lower()
    if mode == "name":
        tracks.sort(key=lambda item: item["name"].casefold())
    elif mode == "oldest":
        tracks.sort(key=lambda item: (item["modified"], item["name"].casefold()))
    elif mode == "duration":
        tracks.sort(key=lambda item: (item["duration"] is None, item["duration"] or 0, item["name"].casefold()))
    elif mode == "favorites":
        tracks.sort(key=lambda item: (not item["favorite"], -item["modified"], item["name"].casefold()))
    else:
        mode = "newest"
        tracks.sort(key=lambda item: (-item["modified"], item["name"].casefold()))
    return {
        "folder": label,
        "external": external,
        "sort": mode,
        "favorites_only": _safe_bool(favorites_only, False),
        "favorite_count": sum(1 for track in tracks if track["favorite"]),
        "count": len(tracks),
        "tracks": tracks,
    }


def rename_music_library_track(folder_value: Any, filename: Any, new_name: Any) -> Dict[str, Any]:
    folder, label, _external = _resolve_library_folder(folder_value)
    source = _safe_library_audio(folder, filename)
    requested = Path(_clean_text(new_name)).stem
    safe_stem = _sanitise_filename_component(requested, source.stem)
    targets = [source.with_name(f"{safe_stem}{source.suffix.lower()}")]
    sources = [source]
    for extension in (".txt", ".json"):
        sidecar = source.with_suffix(extension)
        if sidecar.is_file():
            sources.append(sidecar)
            targets.append(sidecar.with_name(f"{safe_stem}{extension}"))
    for target in targets:
        if target.exists() and target not in sources:
            raise FileExistsError(f"{target.name} already exists.")
    moved: List[Tuple[Path, Path]] = []
    try:
        for old, new in zip(sources, targets):
            if old == new:
                continue
            old.rename(new)
            moved.append((old, new))
    except Exception:
        for old, new in reversed(moved):
            if new.exists() and not old.exists():
                new.rename(old)
        raise
    favorites = _load_music_favorites(folder)
    if source.name in favorites:
        favorites.discard(source.name)
        favorites.add(targets[0].name)
        _write_music_favorites(folder, favorites)
    return {"folder": label, "old_name": source.name, "track": _audio_file_info(targets[0])}


def trash_music_library_track(folder_value: Any, filename: Any) -> Dict[str, Any]:
    folder, label, _external = _resolve_library_folder(folder_value)
    source = _safe_library_audio(folder, filename)
    sources = [source] + [
        source.with_suffix(extension)
        for extension in (".txt", ".json")
        if source.with_suffix(extension).is_file()
    ]
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    trash = folder / "NovoLoko_Trash" / f"{stamp}_{_sanitise_filename_component(source.stem)}"
    trash.mkdir(parents=True, exist_ok=False)
    moved: List[Tuple[Path, Path]] = []
    try:
        for old in sources:
            new = trash / old.name
            old.rename(new)
            moved.append((old, new))
    except Exception:
        for old, new in reversed(moved):
            if new.exists() and not old.exists():
                new.rename(old)
        shutil.rmtree(trash, ignore_errors=True)
        raise
    favorites = _load_music_favorites(folder)
    if source.name in favorites:
        favorites.discard(source.name)
        _write_music_favorites(folder, favorites)
    return {"folder": label, "name": source.name, "trash_folder": str(trash)}


def reveal_music_library_track(folder_value: Any, filename: Any) -> Dict[str, Any]:
    """Open Windows File Explorer with the validated audio file selected."""

    folder, label, _external = _resolve_library_folder(folder_value)
    source = _safe_library_audio(folder, filename)
    if os.name != "nt":
        raise OSError("Show Selected in Folder is available on Windows.")
    subprocess.Popen(
        ["explorer.exe", f"/select,{source}"],
        close_fds=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    return {"folder": label, "name": source.name}


def _selection_from_report_value(
    key: str,
    value: Any,
    catalog: Mapping[str, Sequence[Mapping[str, str]]] | None = None,
) -> Tuple[str, str, str]:
    """Convert a saved transparency value back into a stable Controls choice."""

    text = _clean_text(value)
    if not text or text.startswith(NONE_OPTION):
        return NONE_OPTION, "", NONE_OPTION
    if text.startswith(CUSTOM_OPTION):
        custom = text[len(CUSTOM_OPTION):].strip()
        if custom.startswith("->"):
            custom = custom[2:].strip()
        if custom.startswith("("):
            custom = ""
        return CUSTOM_OPTION, custom, custom or CUSTOM_OPTION
    if text.startswith(f"{RANDOM_OPTION} ->"):
        resolved = text.split("->", 1)[1].strip()
        return RANDOM_OPTION, "", resolved
    rows = catalog[key] if catalog is not None else load_music_catalog()[key]
    valid = {row["name"] for row in rows}
    if text in valid:
        return text, "", text
    # Older sidecars can outlive a renamed CSV choice. Preserve their readable
    # resolved value through Custom instead of silently replacing it.
    return (CUSTOM_OPTION, text, text) if text else (NONE_OPTION, "", NONE_OPTION)


def _recipe_from_record(record: Mapping[str, Any]) -> Dict[str, Any]:
    """Return a validated v2 recipe, with a lossless fallback for old sidecars."""

    stored = record.get("controls_recipe")
    if isinstance(stored, Mapping):
        selections = dict(stored.get("selections") or stored.get("decisions") or {})
        custom_values = dict(stored.get("custom_values") or {})
        resolved_values = dict(stored.get("resolved_selections") or {})
        recipe = {
            "schema": CONTROLS_RECIPE_SCHEMA,
            "original_idea": _clean_text(stored.get("original_idea", record.get("original_idea"))),
            "preset": CUSTOM_PRESET,
            "source_preset": (
                _clean_text(stored.get("source_preset"))
                or _clean_text(stored.get("preset"))
                or _clean_text(record.get("preset"))
            ),
            "effective_preset": _clean_text(stored.get("effective_preset")) or _clean_text(record.get("preset")),
            "randomize_all": _safe_bool(stored.get("randomize_all"), False),
            "allow_random_none": _safe_bool(stored.get("allow_random_none"), False),
            "random_preset_scope": _clean_text(stored.get("random_preset_scope")) or "Off",
            "random_preset_filter": _clean_text(stored.get("random_preset_filter")),
            "seed": _safe_int(stored.get("seed", record.get("stacker_seed", 0)), 0, 0, SEED_MAX),
            "seed_after_run": (
                _clean_text(stored.get("seed_after_run"))
                if _clean_text(stored.get("seed_after_run")) in SEED_AFTER_RUN_MODES
                else "Fixed"
            ),
            "selections": {},
            "custom_values": {},
            "resolved_selections": {},
            "resolved_display_selections": dict(stored.get("resolved_display_selections") or {}),
            "reference_label": _clean_text(stored.get("reference_label")),
            "reference_mode": _clean_text(stored.get("reference_mode")),
            "reference_strength": _clean_text(stored.get("reference_strength")),
            "reference_overrides": [
                key for key in stored.get("reference_overrides", []) if key in CATEGORY_SPECS
            ] if isinstance(stored.get("reference_overrides", []), list) else [],
            "reference_traits_locked": list(stored.get("reference_traits_locked") or []),
            "reference_traits_influenced": list(stored.get("reference_traits_influenced") or []),
        }
        catalog = load_music_catalog()
        for key in CATEGORY_SPECS:
            requested = _clean_text(selections.get(key))
            custom = _clean_text(custom_values.get(key))
            resolved = _clean_text(resolved_values.get(key))
            valid = {row["name"] for row in catalog[key]}
            if requested not in {NONE_OPTION, CUSTOM_OPTION, RANDOM_OPTION} and requested not in valid:
                requested = CUSTOM_OPTION if requested else NONE_OPTION
                custom = custom or resolved
            recipe["selections"][key] = requested or NONE_OPTION
            recipe["custom_values"][key] = custom
            recipe["resolved_selections"][key] = resolved or (custom if requested == CUSTOM_OPTION else requested)
        if recipe["random_preset_scope"] not in RANDOM_PRESET_SCOPES:
            recipe["random_preset_scope"] = "Off"
        return recipe

    selected = record.get("stacker_selections")
    selected = dict(selected) if isinstance(selected, Mapping) else {}
    if not selected:
        for line in _clean_text(record.get("selected_options_report")).splitlines():
            if ":" not in line:
                continue
            label_name, saved_value = line.split(":", 1)
            selected[_clean_text(label_name)] = _clean_text(saved_value)

    selections: Dict[str, str] = {}
    custom_values: Dict[str, str] = {}
    resolved_values: Dict[str, str] = {}
    catalog = load_music_catalog()
    for key, spec in CATEGORY_SPECS.items():
        saved_value = selected.get(spec["label"])
        if saved_value is None:
            saved_value = selected.get(spec.get("legacy_label", spec["label"]), "")
        choice, custom, resolved = _selection_from_report_value(key, saved_value, catalog)
        selections[key] = choice
        custom_values[key] = custom
        resolved_values[key] = resolved

    seed = _safe_int(
        selected.get("Seed", record.get("stacker_seed", record.get("generation_seed", 0))),
        0, 0, SEED_MAX,
    )
    random_scope_text = _clean_text(selected.get("Random preset scope"))
    random_scope, _, random_filter = random_scope_text.partition(" /")
    random_scope = random_scope.strip() or "Off"
    if " -> " in random_filter:
        random_filter = random_filter.split(" -> ", 1)[0]
    return {
        "schema": CONTROLS_RECIPE_SCHEMA,
        "original_idea": _clean_text(record.get("original_idea")),
        "preset": CUSTOM_PRESET,
        "source_preset": _clean_text(record.get("preset")) or _clean_text(selected.get("Preset")),
        "effective_preset": _clean_text(record.get("preset")) or _clean_text(selected.get("Preset")),
        "randomize_all": _safe_bool(selected.get("Randomize all", record.get("randomize_all")), False),
        "allow_random_none": _safe_bool(selected.get("Random can choose None"), False),
        "random_preset_scope": random_scope if random_scope in RANDOM_PRESET_SCOPES else "Off",
        "random_preset_filter": random_filter.strip(),
        "seed": seed,
        "seed_after_run": (
            _clean_text(selected.get("After run"))
            if _clean_text(selected.get("After run")) in SEED_AFTER_RUN_MODES
            else "Fixed"
        ),
        "selections": selections,
        "custom_values": custom_values,
        "resolved_selections": resolved_values,
        "resolved_display_selections": {
            key: _choice_display(key, {"name": resolved_values[key]})
            for key in CATEGORY_SPECS
        },
        "reference_label": _clean_text(selected.get("Reference label (search/audit only)")),
        "reference_mode": _clean_text(selected.get("Reference mode")),
        "reference_strength": _clean_text(selected.get("Reference strength")),
        "reference_overrides": [],
        "reference_traits_locked": [],
        "reference_traits_influenced": [],
    }


def _reference_display_name(value: Any) -> str:
    text = _clean_text(value)
    if text.endswith(" — Clone"):
        return f"{text[:-8]} — Strong reference"
    if text.endswith(" — Like"):
        return f"{text[:-7]} — Loose reference"
    return text


def _generation_summary(record: Mapping[str, Any]) -> Dict[str, Any]:
    stored = record.get("controls_recipe") if isinstance(record.get("controls_recipe"), Mapping) else {}
    source = _clean_text(stored.get("source_preset") or stored.get("preset"))
    effective = _clean_text(stored.get("effective_preset") or record.get("preset"))
    if source == RANDOM_PRESET and effective and effective != source:
        preset = f"Random → {_reference_display_name(effective)}"
    elif effective == CUSTOM_PRESET or source == CUSTOM_PRESET:
        preset = "Custom controls"
    else:
        preset = _reference_display_name(effective or source)
    raw_seed = record.get("generation_seed")
    if raw_seed in (None, ""):
        raw_seed = stored.get("seed", record.get("stacker_seed"))
    seed = _safe_int(raw_seed, 0, 0, SEED_MAX) if raw_seed not in (None, "") else None
    settings = record.get("generation_settings")
    if not isinstance(settings, Mapping):
        settings = {}
    duration = settings.get("requested_duration_seconds", settings.get("target_duration_seconds"))
    try:
        target_seconds = float(duration) if duration not in (None, "") else None
    except (TypeError, ValueError):
        target_seconds = None
    return {
        "recorded": bool(preset or seed is not None or target_seconds is not None),
        "preset": preset,
        "seed": seed,
        "target_seconds": target_seconds,
    }


def _summary_from_txt(text: str) -> Dict[str, Any]:
    def field(label: str) -> str:
        match = re.search(rf"(?mi)^{re.escape(label)}:\s*(.*?)\s*$", text)
        return match.group(1).strip() if match else ""

    duration_match = re.search(r'"(?:requested|target)_duration_seconds"\s*:\s*([0-9.]+)', text)
    record: Dict[str, Any] = {
        "preset": field("Preset"),
        "generation_seed": field("Generation seed") or field("Stacker seed"),
    }
    if duration_match:
        record["generation_settings"] = {"requested_duration_seconds": duration_match.group(1)}
    return _generation_summary(record)


def load_music_library_sidecar(folder_value: Any, filename: Any) -> Dict[str, Any]:
    """Load a validated matched JSON sidecar and build an exact Controls recipe."""

    folder, label, _external = _resolve_library_folder(folder_value)
    audio_path = _safe_library_audio(folder, filename)
    json_path = audio_path.with_suffix(".json")
    if not json_path.is_file():
        txt_path = audio_path.with_suffix(".txt")
        if not txt_path.is_file():
            return {
                "folder": label,
                "name": audio_path.name,
                "sidecar": "",
                "schema": "",
                "recipe": None,
                "lyrics": "",
                "lyric_brief": "",
                "original_idea": "",
                "music_caption": "",
                "generation_summary": {"recorded": False, "preset": "", "seed": None, "target_seconds": None},
            }
        text = txt_path.read_text(encoding="utf-8", errors="replace")
        return {
            "folder": label,
            "name": audio_path.name,
            "sidecar": txt_path.name,
            "schema": "legacy-text",
            "recipe": None,
            "lyrics": "",
            "lyric_brief": "",
            "original_idea": "",
            "music_caption": "",
            "generation_summary": _summary_from_txt(text),
        }
    try:
        record = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        raise ValueError(f"The matched JSON sidecar cannot be read: {error}") from error
    if not isinstance(record, Mapping):
        raise ValueError("The matched JSON sidecar is not a NovoLoko metadata record.")

    recipe = _recipe_from_record(record)
    return {
        "folder": label,
        "name": audio_path.name,
        "sidecar": json_path.name,
        "schema": _clean_text(record.get("schema")),
        "recipe": recipe,
        "lyrics": _clean_text(record.get("final_structured_lyrics")),
        "lyric_brief": _clean_text(record.get("lyric_enhancer_brief")),
        "original_idea": recipe["original_idea"],
        "music_caption": _clean_text(record.get("final_music_caption")),
        "generation_summary": _generation_summary(record),
    }


class _MusicTextGenerator:
    _cache: "OrderedDict[Tuple[Any, ...], str]" = OrderedDict()
    _cache_limit = 48

    @classmethod
    def _generate(
        cls,
        clip: Any,
        instruction: str,
        creativity: float,
        max_length: int,
        seed: int,
        thinking: bool,
        use_default_template: bool,
    ) -> Tuple[str, bool, float]:
        if not hasattr(clip, "tokenize") or not hasattr(clip, "generate") or not hasattr(clip, "decode"):
            raise RuntimeError(
                "The connected CLIP cannot generate text. Connect a generative Qwen/Krea2 CLIP "
                "such as the one already used by NovoLoko Prompt Enhancer Pro."
            )
        cache_key = (
            cls.__name__,
            _clip_token(clip),
            instruction,
            float(creativity),
            int(max_length),
            int(seed),
            bool(thinking),
            bool(use_default_template),
        )
        cached = cls._cache.get(cache_key)
        if cached is not None:
            cls._cache.move_to_end(cache_key)
            return cached, True, 0.0
        started = time.perf_counter()
        tokens = clip.tokenize(
            instruction,
            image=None,
            skip_template=not use_default_template,
            min_length=1,
            thinking=thinking,
        )
        generated_ids = clip.generate(
            tokens,
            do_sample=True,
            max_length=max_length,
            temperature=creativity,
            top_k=64,
            top_p=0.95,
            min_p=0.05,
            repetition_penalty=1.06,
            presence_penalty=0.0,
            seed=seed,
        )
        text = _strip_model_wrapper(clip.decode(generated_ids))
        elapsed = time.perf_counter() - started
        cls._cache[cache_key] = text
        cls._cache.move_to_end(cache_key)
        while len(cls._cache) > cls._cache_limit:
            cls._cache.popitem(last=False)
        return text, False, elapsed


class _OllamaMusicWriter:
    """Expose a local Ollama GGUF model through the generative CLIP contract."""

    def __init__(self, model: str, keep_alive: str, context_length: int, timeout: int):
        self.model = _clean_text(model) or OLLAMA_WRITER_DEFAULT
        self.keep_alive = keep_alive
        self.context_length = context_length
        self.timeout = timeout
        self.last_metrics: Dict[str, Any] = {}

    def _request(self, payload: Mapping[str, Any]) -> Dict[str, Any]:
        body = json.dumps(dict(payload), ensure_ascii=False).encode("utf-8")
        request = Request(
            OLLAMA_WRITER_URL,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                raw = response.read(32 * 1024 * 1024 + 1)
        except HTTPError as error:
            detail = error.read(4096).decode("utf-8", errors="replace")
            raise RuntimeError(f"Ollama rejected writer model '{self.model}': HTTP {error.code}: {detail}") from error
        except (URLError, TimeoutError, OSError) as error:
            raise RuntimeError(
                "NovoLoko could not reach local Ollama at 127.0.0.1:11434. "
                "Start Ollama, then ensure the selected novoloko-music-* model is installed."
            ) from error
        if len(raw) > 32 * 1024 * 1024:
            raise RuntimeError("Ollama returned an unexpectedly large writer response.")
        try:
            result = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise RuntimeError("Ollama returned an invalid writer response.") from error
        if not isinstance(result, dict) or result.get("error"):
            raise RuntimeError(f"Ollama writer failed: {result.get('error', 'unknown response')}")
        self.last_metrics = {
            key: result.get(key)
            for key in ("total_duration", "load_duration", "prompt_eval_count", "eval_count", "eval_duration")
            if result.get(key) is not None
        }
        return result

    def preload(self) -> Dict[str, Any]:
        return self._request(
            {
                "model": self.model,
                "prompt": "",
                "stream": False,
                "keep_alive": self.keep_alive,
                "options": {"num_ctx": self.context_length, "num_predict": 0},
            }
        )

    def unload(self) -> Dict[str, Any]:
        """Release this benchmark writer without touching ComfyUI's models."""
        return self._request(
            {
                "model": self.model,
                "prompt": "",
                "stream": False,
                "keep_alive": 0,
                "options": {"num_predict": 0},
            }
        )

    def tokenize(self, instruction: str, image=None, skip_template=False, min_length=1, thinking=False):
        del image, min_length
        return {
            "prompt": str(instruction),
            "raw": bool(skip_template),
            "thinking": bool(thinking),
        }

    def generate(self, tokens: Mapping[str, Any], **options):
        seed = int(options.get("seed", 0)) & 0x7FFFFFFF
        result = self._request(
            {
                "model": self.model,
                "prompt": str(tokens.get("prompt", "")),
                "stream": False,
                "raw": bool(tokens.get("raw", False)),
                "think": bool(tokens.get("thinking", False)),
                "keep_alive": self.keep_alive,
                "options": {
                    "num_ctx": self.context_length,
                    "num_predict": int(options.get("max_length", 2048)),
                    "temperature": float(options.get("temperature", 0.8)),
                    "top_k": int(options.get("top_k", 64)),
                    "top_p": float(options.get("top_p", 0.95)),
                    "min_p": float(options.get("min_p", 0.05)),
                    "repeat_penalty": float(options.get("repetition_penalty", 1.06)),
                    "seed": seed,
                },
            }
        )
        return str(result.get("response", ""))

    @staticmethod
    def decode(generated: Any) -> str:
        return str(generated or "")


class NovaMusicWriterOllamaLoader:
    """Load a text-only GGUF writer without replacing MiniMax's native encoder."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": (
                    "STRING",
                    {
                        "default": OLLAMA_WRITER_DEFAULT,
                        "tooltip": "The NovoLoko frontend replaces this compatibility field with an auto-refreshing local-model dropdown. Manual entry remains available under Advanced.",
                    },
                ),
                "keep_alive": (["10m", "30m", "1h", "-1"], {"default": "30m"}),
                "context_length": ("INT", {"default": 8192, "min": 4096, "max": 32768, "step": 1024}),
                "timeout_seconds": ("INT", {"default": 600, "min": 30, "max": 3600, "step": 30}),
            }
        }

    RETURN_TYPES = ("CLIP", "STRING")
    RETURN_NAMES = ("writer", "load_status")
    FUNCTION = "load_writer"
    CATEGORY = "NovoLoko/Music/MiniMax Music 3"
    DESCRIPTION = (
        "Optional local Ollama/GGUF writer loader. Ollama supplies the causal generation runtime, tokenizer, "
        "chat template, KV cache and model lifecycle that ComfyUI's diffusion/text-encoder GGUF loaders do not. "
        "It does not replace the MiniMax Music 3 native int8-convrot text encoder."
    )

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        del kwargs
        return float("nan")

    def load_writer(self, model=OLLAMA_WRITER_DEFAULT, keep_alive="30m", context_length=8192, timeout_seconds=600):
        writer = _OllamaMusicWriter(
            model,
            str(keep_alive),
            _safe_int(context_length, 8192, 4096, 32768),
            _safe_int(timeout_seconds, 600, 30, 3600),
        )
        started = time.perf_counter()
        writer.preload()
        elapsed = time.perf_counter() - started
        load_ns = int(writer.last_metrics.get("load_duration") or 0)
        load_seconds = load_ns / 1_000_000_000
        return (
            writer,
            f"Loaded local Ollama writer '{writer.model}' in {elapsed:.3f}s "
            f"(reported model load {load_seconds:.3f}s); keep-alive {writer.keep_alive}.",
        )


class NovaMusicWriterBackendSelector:
    """Lazily choose Ollama GGUF or the existing Comfy safetensors writer."""

    OLLAMA = "FAST / BALANCED / Gemma / Other installed local models (Ollama GGUF)"
    COMFY = "Comfy safetensors fallback"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "backend": ([cls.OLLAMA, cls.COMFY], {"default": cls.OLLAMA}),
            },
            "optional": {
                "ollama_writer": ("CLIP", {"lazy": True}),
                "comfy_writer": ("CLIP", {"lazy": True}),
            },
        }

    RETURN_TYPES = ("CLIP", "STRING")
    RETURN_NAMES = ("writer", "backend_status")
    FUNCTION = "select_writer"
    CATEGORY = "NovoLoko/Music/MiniMax Music 3"
    DESCRIPTION = (
        "Main-workflow writer selector. Ollama is the supported FAST default and its loader discovers FAST, "
        "BALANCED, Gemma and other installed local models. Comfy safetensors keeps the validated Qwen3-VL "
        "fallback. Lazy inputs prevent the unused backend from loading."
    )

    @classmethod
    def check_lazy_status(cls, backend=OLLAMA, ollama_writer=None, comfy_writer=None):
        selected = "comfy_writer" if backend == cls.COMFY else "ollama_writer"
        if (comfy_writer if selected == "comfy_writer" else ollama_writer) is None:
            return [selected]
        return []

    def select_writer(self, backend=OLLAMA, ollama_writer=None, comfy_writer=None):
        if backend == self.COMFY:
            if comfy_writer is None:
                raise RuntimeError("Comfy safetensors fallback is selected but no Comfy writer is connected.")
            return (comfy_writer, "Comfy safetensors fallback selected: qwen3VLInstruct4bHeretic_v10 / krea2.")
        if ollama_writer is None:
            raise RuntimeError("Ollama GGUF is selected but no Ollama writer is connected.")
        model = _clean_text(getattr(ollama_writer, "model", "local model"))
        return (ollama_writer, f"Ollama GGUF selected: {model}. Thinking remains controlled by stages 3A/3B/3C.")


class NovaMusicIdea:
    """Small dedicated idea source so a workflow starts with plain language."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "idea": (
                    "STRING",
                    {
                        "default": "heavy rap with cash and guns",
                        "multiline": True,
                        "dynamicPrompts": True,
                        "tooltip": "A short song idea. The lyric and caption paths expand it separately.",
                    },
                )
            }
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("music_idea", "status")
    FUNCTION = "emit"
    CATEGORY = "NovoLoko/Music/MiniMax Music 3"

    def emit(self, idea=""):
        text = _clean_text(idea)
        return (text, f"Music idea ready: {len(text)} characters." if text else "No music idea supplied.")


class NovaMusicControls:
    """CSV-backed, seed-stable controls with explicit batch selection reporting."""

    @classmethod
    def INPUT_TYPES(cls):
        catalog = load_music_catalog()
        presets = load_music_presets()
        required: "OrderedDict[str, Any]" = OrderedDict(
            (
                (
                    "preset",
                    (
                        [CUSTOM_PRESET, NONE_PRESET, *presets.keys(), RANDOM_PRESET],
                        {
                            "default": "Heavy Rap / Trap / Drill",
                            "tooltip": "A named preset loads its resolved categories. Custom uses the category panel. None contributes no category prompt text.",
                        },
                    ),
                ),
                (
                    "randomize_all",
                    (
                        "BOOLEAN",
                        {
                            "default": False,
                            "tooltip": "Randomizes every category deterministically from seed, overriding the preset and category widgets.",
                        },
                    ),
                ),
                (
                    "seed",
                    (
                        "INT",
                        {
                            "default": 0,
                            "min": 0,
                            "max": SEED_MAX,
                            "control_after_generate": True,
                            "tooltip": "Seed for deterministic category resolution. Use After run to randomize only this seed without changing the 19 control policies.",
                        },
                    ),
                ),
            )
        )
        for key, spec in CATEGORY_SPECS.items():
            names = [row["name"] for row in catalog[key]]
            required[key] = (
                [NONE_OPTION, CUSTOM_OPTION, RANDOM_OPTION, *names],
                {
                    "default": spec["default"],
                    "tooltip": f"{spec['label']}: None adds nothing, Custom uses its matching text field, and Random is seed-stable.",
                },
            )
        # Appended after every v4.2 widget to retain the public widget order for
        # existing workflows. The frontend presents each text field directly
        # beneath its category only while Custom is selected.
        for key, spec in CATEGORY_SPECS.items():
            required[f"custom_{key}"] = (
                "STRING",
                {
                    "default": "",
                    "tooltip": f"Used only when {spec['label']} is Custom...",
                },
            )
        required["allow_random_none"] = (
            "BOOLEAN",
            {
                "default": False,
                "tooltip": "Off keeps None out of Random. On allows Random to deliberately choose no preference.",
            },
        )
        required["random_preset_scope"] = (
            list(RANDOM_PRESET_SCOPES),
            {
                "default": "Off",
                "tooltip": "Choose one complete named preset deterministically from all presets, a preset folder, or a genre.",
            },
        )
        required["random_preset_filter"] = (
            "STRING",
            {
                "default": "",
                "tooltip": "Folder or genre used by Random preset scope. The compact frontend fills this list.",
            },
        )
        # Appended after every v4.5.1 widget so existing serialized controls keep
        # their exact positions. The frontend moves this multiline value to the
        # top of its unified panel without changing the backend contract.
        required["idea"] = (
            "STRING",
            {
                "default": "heavy rap with cash and guns",
                "multiline": True,
                "dynamicPrompts": True,
                "tooltip": "Editable song idea shared by the separate lyric and music-caption paths.",
            },
        )
        # Appended after the complete v4.6.1 widget contract. The custom UI
        # stores only category keys manually changed after a named preset was
        # applied; older workflows deserialize with the empty default.
        required["control_overrides_json"] = (
            "STRING",
            {
                "default": "[]",
                "tooltip": "Internal compatibility-safe record of controls that override a named reference preset.",
            },
        )
        # Appended after the full v4.6.2 reference-preset contract. This mirrors
        # ComfyUI's seed control_after_generate widget in a backend-visible form
        # so recipes and transparency can record the seed-only policy.
        required["seed_after_run"] = (
            list(SEED_AFTER_RUN_MODES),
            {
                "default": "Fixed",
                "tooltip": "Fixed keeps this seed. Randomize Seed changes only the seed after each run; the 19 category choices and policies remain untouched.",
            },
        )
        return {"required": required}

    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING", "FLOAT", "INT", "STRING", "STRING")
    RETURN_NAMES = (
        "music_style_brief",
        "lyric_direction",
        "section_plan",
        "selected_options",
        "duration_seconds",
        "seed_used",
        "music_idea",
        "controls_recipe_json",
    )
    FUNCTION = "build"
    CATEGORY = "NovoLoko/Music/MiniMax Music 3"

    @classmethod
    def VALIDATE_INPUTS(cls, **_kwargs):
        return True

    @classmethod
    def resolve_selections(
        cls,
        preset: str = "Heavy Rap / Trap / Drill",
        randomize_all: bool = False,
        seed: int = 0,
        **selections: Any,
    ) -> Tuple["OrderedDict[str, Dict[str, str]]", str, bool, int]:
        catalog = load_music_catalog()
        presets = load_music_presets()
        seed = _safe_int(seed, 0, 0, SEED_MAX)
        randomize_all = _safe_bool(randomize_all, False) or preset == RANDOM_PRESET
        preset_name = str(preset or CUSTOM_PRESET)
        random_scope = _clean_text(selections.get("random_preset_scope", "Off"))
        if random_scope not in RANDOM_PRESET_SCOPES:
            random_scope = "Off"
        random_filter = _clean_text(selections.get("random_preset_filter", ""))
        if random_scope != "Off" and not randomize_all and presets:
            candidates = []
            for name, row in presets.items():
                if _safe_bool(row.get("__hidden"), False):
                    continue
                if random_scope == "Preset Folder" and random_filter and _default_preset_folder(row) != random_filter:
                    continue
                if random_scope == "Genre" and random_filter and _clean_text(row.get("genre")) != random_filter:
                    continue
                candidates.append({
                    "name": name,
                    "_random_weight": _preset_random_weight({**row, "name": name}),
                })
            if candidates:
                preset_name = _seeded_choice(seed, f"preset:{random_scope}:{random_filter}", candidates)["name"]
        preset_row = presets.get(preset_name)
        if preset_row is not None and _clean_text(preset_row.get("__alias_target")):
            preset_name = _clean_text(preset_row.get("__alias_target"))
            preset_row = presets.get(preset_name)
        none_preset = preset_name == NONE_PRESET
        if preset_name not in {CUSTOM_PRESET, NONE_PRESET, RANDOM_PRESET} and preset_row is None:
            preset_name = CUSTOM_PRESET

        allow_random_none = _safe_bool(selections.get("allow_random_none"), False)
        control_overrides = _parse_control_overrides(selections.get("control_overrides_json"))
        explicit_customs = {
            key: _clean_text(selections.get(f"custom_{key}", ""))
            for key in CATEGORY_SPECS
        }
        preset_customs = preset_row.get("__custom_values", {}) if preset_row is not None else {}

        resolved: "OrderedDict[str, Dict[str, str]]" = OrderedDict()
        for key, spec in CATEGORY_SPECS.items():
            rows = catalog[key]
            if randomize_all:
                requested = RANDOM_OPTION
                custom_text = explicit_customs[key]
            elif none_preset:
                requested = NONE_OPTION
                custom_text = ""
            elif preset_row is not None:
                if key in control_overrides:
                    requested = _clean_text(selections.get(key, spec["default"]))
                    custom_text = explicit_customs[key]
                else:
                    requested = _clean_text(preset_row.get(key, spec["default"]))
                    custom_text = _clean_text(preset_customs.get(key, ""))
            else:
                requested = _clean_text(selections.get(key, spec["default"]))
                custom_text = explicit_customs[key]
            row = _resolve_category_choice(
                seed,
                key,
                rows,
                requested,
                custom_text,
                allow_random_none,
            )
            if not row:
                row = _catalog_selection(_row_map(rows).get(spec["default"], rows[0]))
            resolved[key] = row
        effective_preset = (
            RANDOM_PRESET
            if randomize_all
            else NONE_PRESET
            if none_preset
            else preset_name
            if preset_row is not None
            else CUSTOM_PRESET
        )
        return resolved, effective_preset, randomize_all, seed

    def build(self, preset="Heavy Rap / Trap / Drill", randomize_all=False, seed=0, **selections):
        idea = _clean_text(selections.get("idea"))
        source_preset = _clean_text(preset) or CUSTOM_PRESET
        control_overrides = _parse_control_overrides(selections.get("control_overrides_json"))
        requested_randomize_all = _safe_bool(randomize_all, False) or source_preset == RANDOM_PRESET
        seed_after_run = _clean_text(selections.get("seed_after_run"))
        if seed_after_run not in SEED_AFTER_RUN_MODES:
            seed_after_run = "Fixed"
        resolved, effective_preset, randomize_all, seed = self.resolve_selections(
            preset, randomize_all, seed, **selections
        )
        prompts = {key: row["prompt"] for key, row in resolved.items()}

        def joined(*keys: str) -> str:
            return " ".join(prompts[key] for key in keys if prompts[key]).strip()

        reference_row = load_music_presets().get(effective_preset, {})
        reference_dna = ""
        reference_mode = _clean_text(reference_row.get("reference_mode"))
        reference_label = _clean_text(reference_row.get("reference"))
        locked_traits: List[str] = []
        influenced_traits: List[str] = []
        if reference_label and reference_mode in REFERENCE_MODES:
            reference_dna, locked_traits, influenced_traits = _reference_dna(
                resolved, reference_mode, control_overrides
            )

        caption_sections = [
            (
                "Global Metadata",
                " ".join(
                    filter(
                        None,
                        (
                            reference_dna,
                            joined("genre", "subgenre_era", "mood", "bpm_tempo", "song_length"),
                        ),
                    )
                ),
            ),
            ("Vocal Details", joined("vocal_gender_type", "vocal_delivery", "hook_style", "adlibs")),
            ("Arrangement", joined("instruments", "production_style", "song_structure")),
        ]
        music_style_brief = "\n\n".join(
            f"{heading}: {text}" for heading, text in caption_sections if text
        )
        lyric_items = [
            ("Themes", prompts["themes"]),
            ("Explicitness", prompts["explicitness"]),
            ("Aggression", prompts["aggression"]),
            ("Darkness", prompts["darkness"]),
            ("Rhyme density", prompts["rhyme_density"]),
            ("Wordplay", prompts["wordplay"]),
            ("Storytelling", prompts["storytelling"]),
            ("Hook", prompts["hook_style"]),
            ("Ad-libs", prompts["adlibs"]),
            ("Vocal performance", joined("vocal_gender_type", "vocal_delivery")),
            ("Length", prompts["song_length"]),
            ("Structure", prompts["song_structure"]),
        ]
        lyric_direction = "\n".join(f"{label}: {text}" for label, text in lyric_items if text)
        report_lines = [
            "NovoLoko MiniMax Music 3 selections",
            f"Preset: {effective_preset}",
            f"Randomize all: {'On' if randomize_all else 'Off'}",
            (
                f"Random preset scope: {selections.get('random_preset_scope', 'Off')}"
                + (
                    f" / {selections.get('random_preset_filter', '')}"
                    if _clean_text(selections.get("random_preset_filter", ""))
                    else ""
                )
                + (f" -> {effective_preset}" if selections.get("random_preset_scope", "Off") != "Off" else "")
            ),
            f"Random can choose None: {'On' if _safe_bool(selections.get('allow_random_none'), False) else 'Off'}",
            f"Seed: {seed}",
            f"After run: {seed_after_run} (seed only; 19 controls unchanged)",
        ]
        if reference_label and reference_mode in REFERENCE_MODES:
            report_lines.extend(
                (
                    f"Reference label (search/audit only): {reference_label}",
                    f"Reference mode: {reference_mode}",
                    f"Reference strength: {reference_row.get('reference_strength', '')}",
                    f"Reference traits locked: {', '.join(locked_traits) if locked_traits else 'None'}",
                    f"Reference traits influenced: {', '.join(influenced_traits) if influenced_traits else 'None'}",
                    "Manual Reference DNA overrides: "
                    + (
                        ", ".join(CATEGORY_SPECS[key]["label"] for key in CATEGORY_SPECS if key in control_overrides)
                        if control_overrides else "None"
                    ),
                )
            )
        report_lines.extend(
            f"{CATEGORY_SPECS[key]['label']}: {_resolved_report_display(key, resolved[key])}"
            for key in CATEGORY_SPECS
        )
        duration = _safe_float(resolved["song_length"].get("seconds", 180), 180.0, 15.0, 300.0)
        section_plan = _duration_section_plan(prompts["song_structure"], duration)
        effective_row = load_music_presets().get(effective_preset)
        decision_values: Dict[str, str] = {}
        custom_values: Dict[str, str] = {}
        for key, spec in CATEGORY_SPECS.items():
            if requested_randomize_all:
                requested = RANDOM_OPTION
                custom = _clean_text(selections.get(f"custom_{key}"))
            elif effective_preset == NONE_PRESET:
                requested, custom = NONE_OPTION, ""
            elif effective_row is not None:
                if key in control_overrides:
                    requested = _clean_text(selections.get(key, spec["default"]))
                    custom = _clean_text(selections.get(f"custom_{key}"))
                else:
                    requested = _clean_text(effective_row.get(key, spec["default"]))
                    custom = _clean_text((effective_row.get("__custom_values") or {}).get(key, ""))
            else:
                requested = _clean_text(selections.get(key, spec["default"]))
                custom = _clean_text(selections.get(f"custom_{key}"))
            decision_values[key] = requested or NONE_OPTION
            custom_values[key] = custom
        recipe = {
            "schema": CONTROLS_RECIPE_SCHEMA,
            "original_idea": idea,
            "preset": CUSTOM_PRESET,
            "source_preset": source_preset,
            "effective_preset": effective_preset,
            "randomize_all": requested_randomize_all,
            "allow_random_none": _safe_bool(selections.get("allow_random_none"), False),
            "random_preset_scope": _clean_text(selections.get("random_preset_scope")) or "Off",
            "random_preset_filter": _clean_text(selections.get("random_preset_filter")),
            "seed": seed,
            "seed_after_run": seed_after_run,
            "selections": decision_values,
            "custom_values": custom_values,
            "resolved_selections": {key: row["name"] for key, row in resolved.items()},
            "resolved_display_selections": {key: _choice_display(key, row) for key, row in resolved.items()},
            "reference_label": reference_label,
            "reference_mode": reference_mode if reference_mode in REFERENCE_MODES else "",
            "reference_strength": _clean_text(reference_row.get("reference_strength")),
            "reference_overrides": [key for key in CATEGORY_SPECS if key in control_overrides],
            "reference_traits_locked": locked_traits,
            "reference_traits_influenced": influenced_traits,
        }
        return (
            music_style_brief, lyric_direction, section_plan, "\n".join(report_lines),
            duration, seed, idea, json.dumps(recipe, ensure_ascii=False),
        )


class NovaMusicLyricEnhancer(_MusicTextGenerator):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP", {"tooltip": "Connect the existing generative Qwen/Krea2 enhancer CLIP."}),
                "idea": ("STRING", {"forceInput": True}),
                "lyric_direction": ("STRING", {"forceInput": True}),
                "enabled": ("BOOLEAN", {"default": True}),
                "creativity": ("FLOAT", {"default": 0.85, "min": 0.0, "max": 1.0, "step": 0.05}),
                "max_length": ("INT", {"default": 2048, "min": 256, "max": 8192, "step": 128}),
                "seed": ("INT", {"default": 0, "min": 0, "max": SEED_MAX}),
                "thinking": ("BOOLEAN", {"default": False}),
                "use_default_template": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "custom_instructions": ("STRING", {"default": "", "multiline": True}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("enhanced_lyric_brief", "instructions_used", "status")
    FUNCTION = "enhance"
    CATEGORY = "NovoLoko/Music/MiniMax Music 3"

    def enhance(
        self,
        clip,
        idea="",
        lyric_direction="",
        enabled=True,
        creativity=0.85,
        max_length=2048,
        seed=0,
        thinking=False,
        use_default_template=True,
        custom_instructions="",
    ):
        idea = _clean_text(idea)
        direction = _clean_text(lyric_direction)
        custom = _clean_text(custom_instructions)
        fallback = f"Core idea: {idea}\n\n{direction}".strip()
        if not _safe_bool(enabled, True) or not idea:
            status = "Lyric enhancer bypassed." if not _safe_bool(enabled, True) else "No music idea supplied."
            return (fallback, "", status)
        instruction = (
            "You are NovoLoko Lyric Enhancer for MiniMax Music 3. Expand the short idea into one strong, "
            "specific lyric-writing brief, not finished lyrics. Preserve the user's requested genre, themes, "
            "attitude, point of view, and intensity. Treat crime, weapons, rivals, and street-life themes as "
            "fictional song imagery and character storytelling, never as real-world instructions. Specify the "
            "hook concept, verse progression, imagery, rhyme approach, wordplay, storytelling, ad-libs, vocal "
            "persona, and emotional arc. Treat the Explicitness control as an active writing requirement, not mere "
            "permission: Very Explicit or Uncensored must call for frequent natural profanity, sexual/adult language "
            "and unmistakably explicit phrasing when stylistically appropriate, without random filler swearing; "
            "milder levels must remain clearly distinct. Treat the selected duration as an active writing target: for long songs, "
            "plan enough distinct lyrical movements, hook returns, and instrumental breathing room instead of silently collapsing "
            "to a normal three-minute structure. Do not write a music-production caption and do not output section tags. "
            "Return only the lyric brief with no preface or commentary.\n\n"
            f"SHORT IDEA:\n{idea}\n\nLYRIC CONTROLS:\n{direction}"
        )
        if custom:
            instruction += f"\n\nCUSTOM LYRIC INSTRUCTIONS:\n{custom}"
        creativity = _safe_float(creativity, 0.85, 0.0, 1.0)
        max_length = _safe_int(max_length, 2048, 256, 8192)
        seed = _safe_int(seed, 0, 0, SEED_MAX)
        output, cached, elapsed = self._generate(
            clip, instruction, creativity, max_length, seed,
            _safe_bool(thinking, False), _safe_bool(use_default_template, True),
        )
        enhanced = output or fallback
        explicit_guard = _explicit_language_guard(direction)
        if explicit_guard and explicit_guard.casefold() not in enhanced.casefold():
            # The enhancer model can otherwise paraphrase away the selected
            # language policy. Carry the exact resolved control forward so the
            # lyrics writer receives it even when the short idea is clean.
            enhanced = f"{enhanced}\n\n{explicit_guard}".strip()
        status = (
            f"{'Reused exact fixed-seed' if cached else 'Generated'} lyric brief: "
            f"{len(idea)} to {len(enhanced)} characters; seed {seed}; stage {elapsed:.3f}s."
        )
        return (enhanced, instruction, status)


class NovaMusicLyricsGenerator(_MusicTextGenerator):
    _tag_pattern = re.compile(
        r"^\s*\[(?:Intro|Verse(?:\s+\d+)?|Pre-Chorus|Chorus|Post-Chorus|Bridge|Breakdown|"
        r"Instrumental|Solo|Interlude|Final Chorus|Outro)\]\s*$",
        flags=re.IGNORECASE | re.MULTILINE,
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP", {"tooltip": "Connect the existing generative Qwen/Krea2 enhancer CLIP."}),
                "lyric_brief": ("STRING", {"forceInput": True}),
                "section_plan": ("STRING", {"forceInput": True}),
                "enabled": ("BOOLEAN", {"default": True}),
                "creativity": ("FLOAT", {"default": 0.90, "min": 0.0, "max": 1.0, "step": 0.05}),
                "max_length": ("INT", {"default": 4096, "min": 256, "max": 8192, "step": 128}),
                "seed": ("INT", {"default": 0, "min": 0, "max": SEED_MAX}),
                "thinking": ("BOOLEAN", {"default": False}),
                "use_default_template": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "custom_instructions": ("STRING", {"default": "", "multiline": True}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("lyrics", "instructions_used", "status")
    FUNCTION = "generate_lyrics"
    CATEGORY = "NovoLoko/Music/MiniMax Music 3"

    def generate_lyrics(
        self,
        clip,
        lyric_brief="",
        section_plan="",
        enabled=True,
        creativity=0.9,
        max_length=4096,
        seed=0,
        thinking=False,
        use_default_template=True,
        custom_instructions="",
    ):
        brief = _clean_text(lyric_brief)
        plan = _clean_text(section_plan)
        if not _safe_bool(enabled, True):
            return ("[Instrumental]", "", "Lyrics Generator bypassed; emitted [Instrumental].")
        if not brief:
            return ("", "", "No lyric brief supplied.")
        instruction = (
            "You are NovoLoko Lyrics Generator for MiniMax Music 3. Write one complete original song from the "
            "lyric brief. Output only lyrics. Use clear MiniMax section tags on their own lines, selected from "
            "[Intro], [Verse 1], [Verse 2], [Pre-Chorus], [Chorus], [Post-Chorus], [Bridge], [Breakdown], "
            "[Instrumental], [Solo], [Interlude], [Final Chorus], and [Outro]. Follow the requested section plan "
            "in order and satisfy its duration-specific minimum section count. A five-minute target must contain the requested "
            "long-form lyric volume and instrumental/solo space; do not stop after a standard two-verse three-minute song. "
            "Make the hook memorable, verses distinct, rhymes performable, and ad-libs concise in "
            "parentheses. Do not include production directions, a music caption, analysis, or markdown fences. "
            "Obey explicitness as a positive style requirement: when the brief says Very Explicit or Uncensored, "
            "actively write frequent natural profanity, sexual/adult language and explicit phrasing that fits the "
            "voice; do not soften it into merely implied mature content. Fictional braggadocio, crime, weapons "
            "imagery and rival conflict may appear when requested, but never turn the song into real-world instructions.\n\n"
            f"LYRIC BRIEF:\n{brief}\n\nSECTION PLAN:\n{plan or '[Intro] -> [Verse 1] -> [Chorus] -> [Verse 2] -> [Final Chorus] -> [Outro]'}"
        )
        custom = _clean_text(custom_instructions)
        if custom:
            instruction += f"\n\nCUSTOM LYRIC INSTRUCTIONS:\n{custom}"
        creativity = _safe_float(creativity, 0.90, 0.0, 1.0)
        max_length = _safe_int(max_length, 4096, 256, 8192)
        seed = _safe_int(seed, 0, 0, SEED_MAX)
        output, cached, elapsed = self._generate(
            clip, instruction, creativity, max_length, seed,
            _safe_bool(thinking, False), _safe_bool(use_default_template, True),
        )
        if not output:
            return ("", instruction, f"The lyric model returned no text; seed {seed}.")
        explicit_required = _requires_active_explicit_language(brief)
        retried_for_explicitness = False
        if explicit_required and not _contains_explicit_language(output):
            retry_instruction = (
                f"{instruction}\n\nREVISION REQUIRED: The previous draft was too clean. Rewrite the complete song now "
                "with frequent natural profanity and unmistakably explicit adult language in the lyrics themselves. "
                "Do not put the profanity only in commentary, and do not weaken the selected Uncensored / Very Explicit policy."
            )
            retry_output, retry_cached, retry_elapsed = self._generate(
                clip, retry_instruction, creativity, max_length, seed,
                _safe_bool(thinking, False), _safe_bool(use_default_template, True),
            )
            instruction = retry_instruction
            elapsed += retry_elapsed
            cached = cached and retry_cached
            if retry_output:
                output = retry_output
            retried_for_explicitness = True
        repaired = False
        if not self._tag_pattern.search(output):
            output = f"[Verse 1]\n{output}"
            repaired = True
        tags = [match.group(0).strip() for match in self._tag_pattern.finditer(output)]
        status = (
            f"{'Reused exact fixed-seed' if cached else 'Generated'} {len(output)} characters with "
            f"{len(tags)} MiniMax section tag(s); seed {seed}; stage {elapsed:.3f}s."
        )
        if repaired:
            status += " Added a missing [Verse 1] tag."
        if retried_for_explicitness:
            status += (
                " Rewrote one too-clean draft to enforce the selected explicitness policy."
                if _contains_explicit_language(output)
                else " WARNING: the writer still returned a clean draft after the explicitness retry."
            )
        return (output, instruction, status)


class NovaMusicCaptionEnhancer(_MusicTextGenerator):
    _heading_pattern = re.compile(
        r"Global Metadata\s*:.*Vocal Details\s*:.*Arrangement\s*:",
        flags=re.IGNORECASE | re.DOTALL,
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP", {"tooltip": "Connect the existing generative Qwen/Krea2 enhancer CLIP."}),
                "idea": ("STRING", {"forceInput": True}),
                "music_style_brief": ("STRING", {"forceInput": True}),
                "enabled": ("BOOLEAN", {"default": True}),
                "creativity": ("FLOAT", {"default": 0.70, "min": 0.0, "max": 1.0, "step": 0.05}),
                "max_length": ("INT", {"default": 2048, "min": 256, "max": 8192, "step": 128}),
                "seed": ("INT", {"default": 0, "min": 0, "max": SEED_MAX}),
                "thinking": ("BOOLEAN", {"default": False}),
                "use_default_template": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "custom_instructions": ("STRING", {"default": "", "multiline": True}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("music_caption", "instructions_used", "status")
    FUNCTION = "enhance_caption"
    CATEGORY = "NovoLoko/Music/MiniMax Music 3"

    def enhance_caption(
        self,
        clip,
        idea="",
        music_style_brief="",
        enabled=True,
        creativity=0.70,
        max_length=2048,
        seed=0,
        thinking=False,
        use_default_template=True,
        custom_instructions="",
    ):
        idea = _clean_text(idea)
        brief = _clean_text(music_style_brief)
        if not brief:
            return ("", "", "No music style brief supplied.")
        if not _safe_bool(enabled, True):
            return (brief, "", "Music Caption Enhancer bypassed; CSV caption passed through.")
        instruction = (
            "You are NovoLoko Music Caption Enhancer for MiniMax Music 3. Turn the supplied music-only brief "
            "into one detailed production-ready caption with exactly these three headings in this order: "
            "Global Metadata:, Vocal Details:, Arrangement:. Cover genre, era, BPM, mood arc, vocal timbre and "
            "delivery, instrumentation, mix character, section-by-section arrangement, transitions, and ending. "
            "If the brief includes a Reference DNA priority, Clone or Like guidance, preserve its descriptive traits at the stated "
            "strength, respect manual trait overrides, and never add an artist name. "
            "Keep it musically coherent and specific. The separate Lyrics Generator owns all lyric wording: do not "
            "write, quote, summarize, or replace lyrics, and do not emit [Verse] or other lyric section tags. "
            "Return only the caption with no analysis, alternatives, or markdown fences.\n\n"
            f"SHORT IDEA (concept only):\n{idea}\n\nMUSIC-ONLY CSV BRIEF:\n{brief}"
        )
        custom = _clean_text(custom_instructions)
        if custom:
            instruction += f"\n\nCUSTOM MUSIC-CAPTION INSTRUCTIONS:\n{custom}"
        creativity = _safe_float(creativity, 0.70, 0.0, 1.0)
        max_length = _safe_int(max_length, 2048, 256, 8192)
        seed = _safe_int(seed, 0, 0, SEED_MAX)
        output, cached, elapsed = self._generate(
            clip, instruction, creativity, max_length, seed,
            _safe_bool(thinking, False), _safe_bool(use_default_template, True),
        )
        if not self._heading_pattern.search(output):
            return (
                brief,
                instruction,
                f"Caption safety fallback used the CSV brief because the generated text lost a required heading; seed {seed}.",
            )
        status = (
            f"{'Reused exact fixed-seed' if cached else 'Generated'} MiniMax Music 3 caption: "
            f"{len(output)} characters; seed {seed}; stage {elapsed:.3f}s. Lyrics remained on the separate lyric path."
        )
        return (output, instruction, status)


class NovaMusicSaveAudioMetadata:
    """Save each generated WAV beside human- and machine-readable provenance."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "audio": ("AUDIO",),
                "folder_prefix": (
                    "STRING",
                    {
                        "default": DEFAULT_AUDIO_FOLDER,
                        "tooltip": "Folder under the ComfyUI output root. Absolute paths and parent traversal are blocked.",
                    },
                ),
                "track_name": (
                    "STRING",
                    {
                        "default": DEFAULT_TRACK_NAME,
                        "tooltip": "Windows-invalid filename characters are replaced automatically.",
                    },
                ),
                "save_txt": ("BOOLEAN", {"default": True}),
                "save_json": ("BOOLEAN", {"default": True}),
                "embed_audio_metadata": (
                    "BOOLEAN",
                    {"default": True, "tooltip": "Adds compact title/preset/seed tags to the WAV RIFF INFO block."},
                ),
                "cleanup_after_generation": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "tooltip": "Optional terminal cleanup. Off is safest for multi-output workflows; On unloads ComfyUI models after every complete save-node execution.",
                    },
                ),
                "audio_format": (
                    list(AUDIO_FORMATS),
                    {
                        "default": "WAV (24-bit)",
                        "tooltip": "Save WAV directly, or encode FLAC, 320 kbps MP3, or OGG with FFmpeg. Appended for old-workflow compatibility.",
                    },
                ),
                "model_lifecycle": (
                    list(MODEL_LIFECYCLE_MODES),
                    {
                        "default": "Follow legacy cleanup switch",
                        "tooltip": "One-off unloads models after this complete save. Batch keeps them loaded for fast consecutive songs. Follow legacy preserves older workflow behavior.",
                    },
                ),
            },
            "optional": {
                "original_idea": ("STRING", {"forceInput": True}),
                "selected_options": ("STRING", {"forceInput": True}),
                "lyric_direction": ("STRING", {"forceInput": True}),
                "lyric_enhancer_brief": ("STRING", {"forceInput": True}),
                "final_lyrics": ("STRING", {"forceInput": True}),
                "final_music_caption": ("STRING", {"forceInput": True}),
                "duration_seconds": ("FLOAT", {"forceInput": True}),
                "stacker_seed": ("INT", {"forceInput": True}),
                "generation_seed": ("INT", {"forceInput": True}),
                "enhancer_model_name": ("STRING", {"forceInput": True}),
                "music_model_name": ("STRING", {"forceInput": True}),
                "text_encoder_name": ("STRING", {"forceInput": True}),
                "vae_name": ("STRING", {"forceInput": True}),
                "generation_settings_json": ("STRING", {"forceInput": True}),
                "controls_recipe_json": (
                    "STRING",
                    {
                        "forceInput": True,
                        "tooltip": "Optional lossless v2 IDEA + CSV Controls recipe. Appended for v4.5.1 compatibility.",
                    },
                ),
            },
            "hidden": {
                "prompt": "PROMPT",
            },
        }

    RETURN_TYPES = ("AUDIO", "STRING", "STRING")
    RETURN_NAMES = ("audio", "save_report", "metadata_json")
    FUNCTION = "save"
    CATEGORY = "NovoLoko/Music/MiniMax Music 3"
    OUTPUT_NODE = True

    def save(
        self,
        audio,
        folder_prefix=DEFAULT_AUDIO_FOLDER,
        track_name=DEFAULT_TRACK_NAME,
        save_txt=True,
        save_json=True,
        embed_audio_metadata=True,
        cleanup_after_generation=False,
        audio_format="WAV (24-bit)",
        model_lifecycle="Follow legacy cleanup switch",
        original_idea="",
        selected_options="",
        lyric_direction="",
        lyric_enhancer_brief="",
        final_lyrics="",
        final_music_caption="",
        duration_seconds=0.0,
        stacker_seed=0,
        generation_seed=0,
        enhancer_model_name="",
        music_model_name="",
        text_encoder_name="",
        vae_name="",
        generation_settings_json="",
        controls_recipe_json="",
        prompt=None,
    ):
        save_started = time.perf_counter()
        batch, sample_rate = _normalise_audio_batch(audio)
        root = _output_root()
        relative_folder = _safe_output_subfolder(folder_prefix)
        folder = (root / relative_folder).resolve()
        try:
            folder.relative_to(root)
        except ValueError as error:
            raise ValueError("Save folder must stay inside the ComfyUI output directory.") from error
        folder.mkdir(parents=True, exist_ok=True)

        safe_title = _sanitise_filename_component(track_name, DEFAULT_TRACK_NAME)
        stem = safe_title if safe_title.lower().startswith("novoloko_") else f"NovoLoko_{safe_title}"
        next_index = _next_track_index(folder, stem)
        audio_format = audio_format if audio_format in AUDIO_FORMATS else "WAV (24-bit)"
        model_lifecycle = _clean_text(model_lifecycle)
        if model_lifecycle not in MODEL_LIFECYCLE_MODES:
            model_lifecycle = "Follow legacy cleanup switch"
        if model_lifecycle == "One-off: clean after run":
            effective_cleanup = True
        elif model_lifecycle == "Batch: keep loaded":
            effective_cleanup = False
        else:
            effective_cleanup = _safe_bool(cleanup_after_generation, False)
        audio_extension = AUDIO_FORMATS[audio_format][0]
        prompt_values = _prompt_snapshot(prompt)
        prompt_models = {
            "music_model": prompt_values.get("unet_name") or prompt_values.get("model_name") or "",
            "text_encoders": prompt_values.get("clip_name") or prompt_values.get("text_encoder_name") or "",
            "vae": prompt_values.get("vae_name") or "",
        }
        explicit_models = {
            "enhancer_text_writer": _clean_text(enhancer_model_name),
            "music_model": _clean_text(music_model_name),
            "music_text_encoder": _clean_text(text_encoder_name),
            "vae": _clean_text(vae_name),
        }
        models = {
            key: value
            for key, value in {**prompt_models, **{k: v for k, v in explicit_models.items() if v}}.items()
            if value not in ("", None, [])
        }
        prompt_settings = {
            key: value
            for key, value in prompt_values.items()
            if key not in {"unet_name", "model_name", "clip_name", "text_encoder_name", "vae_name"}
        }
        supplied_settings = _parse_generation_settings(generation_settings_json)
        generation_settings = {
            "requested_duration_seconds": duration_seconds,
            "actual_sample_rate": sample_rate,
            "audio_format": audio_format,
            "model_lifecycle": model_lifecycle,
            **prompt_settings,
        }
        if supplied_settings:
            generation_settings["supplied"] = supplied_settings

        records = []
        ui_audio = []
        created_paths: List[Path] = []
        temporary_paths: List[Path] = []
        try:
            for batch_index, waveform in enumerate(batch):
                file_index = next_index + batch_index
                suffix = f"{file_index:04d}"
                base_name = f"{stem}_{suffix}"
                audio_path = folder / f"{base_name}{audio_extension}"
                txt_path = folder / f"{base_name}.txt"
                json_path = folder / f"{base_name}.json"
                wav_temp = folder / f".{base_name}.tmp.wav"
                audio_temp = folder / f".{base_name}.tmp{audio_extension}"
                txt_temp = folder / f".{base_name}.txt.tmp"
                json_temp = folder / f".{base_name}.json.tmp"
                temporary_paths.extend([wav_temp, audio_temp, txt_temp, json_temp])

                selection_report = _batch_value(selected_options, batch_index, len(batch))
                selections = _selection_fields(selection_report)
                recipe_value = _batch_value(controls_recipe_json, batch_index, len(batch))
                try:
                    recipe_candidate = json.loads(recipe_value) if _clean_text(recipe_value) else {}
                except (TypeError, ValueError, json.JSONDecodeError):
                    recipe_candidate = {}
                explicit_idea = _clean_text(_batch_value(original_idea, batch_index, len(batch)))
                recipe_record = {
                    "controls_recipe": recipe_candidate if isinstance(recipe_candidate, Mapping) else {},
                    "original_idea": explicit_idea,
                    "preset": selections.get("Preset", ""),
                    "randomize_all": selections.get("Randomize all", ""),
                    "stacker_seed": selections.get("Seed", _batch_value(stacker_seed, batch_index, len(batch))),
                    "generation_seed": _batch_value(generation_seed, batch_index, len(batch)),
                    "stacker_selections": selections,
                    "selected_options_report": _clean_text(selection_report),
                }
                controls_recipe = _recipe_from_record(recipe_record)
                saved_idea = explicit_idea or controls_recipe["original_idea"]
                controls_recipe["original_idea"] = saved_idea
                actual_seconds = float(waveform.shape[-1]) / float(sample_rate)
                record = OrderedDict(
                    (
                        ("schema", TRACK_SCHEMA),
                        ("title", _clean_text(track_name) or DEFAULT_TRACK_NAME),
                        ("filename", audio_path.name),
                        ("index", file_index),
                        ("batch_index", batch_index),
                        ("timestamp", datetime.now(timezone.utc).isoformat()),
                        ("original_idea", saved_idea),
                        ("controls_recipe", controls_recipe),
                        ("preset", selections.get("Preset", "")),
                        ("randomize_all", selections.get("Randomize all", "")),
                        ("stacker_seed", selections.get("Seed", _batch_value(stacker_seed, batch_index, len(batch)))),
                        ("generation_seed", _batch_value(generation_seed, batch_index, len(batch))),
                        ("stacker_selections", selections),
                        ("selected_options_report", _clean_text(selection_report)),
                        ("lyric_direction", _clean_text(_batch_value(lyric_direction, batch_index, len(batch)))),
                        ("lyric_enhancer_brief", _clean_text(_batch_value(lyric_enhancer_brief, batch_index, len(batch)))),
                        ("final_structured_lyrics", _clean_text(_batch_value(final_lyrics, batch_index, len(batch)))),
                        ("final_music_caption", _clean_text(_batch_value(final_music_caption, batch_index, len(batch)))),
                        ("models", models),
                        (
                            "generation_settings",
                            {
                                **generation_settings,
                                "actual_duration_seconds": round(actual_seconds, 6),
                                "channels": int(waveform.shape[0]),
                                "source_pcm_bit_depth": 24,
                            },
                        ),
                    )
                )

                _write_pcm24_wav(wav_temp, waveform, sample_rate)
                if _safe_bool(embed_audio_metadata, True) and audio_extension == ".wav":
                    _append_wave_info(
                        wav_temp,
                        {
                            "INAM": record["title"],
                            "ISFT": "NovoLoko MiniMax Music 3",
                            "ICMT": f"Preset={record['preset']}; seed={record['generation_seed']}; metadata={json_path.name}",
                        },
                    )
                if audio_extension != ".wav":
                    _transcode_audio(wav_temp, audio_temp, audio_format)
                    wav_temp.unlink(missing_ok=True)
                if _safe_bool(save_txt, True):
                    txt_temp.write_text(_metadata_text(record), encoding="utf-8", newline="\n")
                if _safe_bool(save_json, True):
                    json_temp.write_text(
                        json.dumps(record, indent=2, ensure_ascii=False) + "\n",
                        encoding="utf-8",
                        newline="\n",
                    )

                if _safe_bool(save_txt, True):
                    os.replace(txt_temp, txt_path)
                    created_paths.append(txt_path)
                if _safe_bool(save_json, True):
                    os.replace(json_temp, json_path)
                    created_paths.append(json_path)
                os.replace(wav_temp if audio_extension == ".wav" else audio_temp, audio_path)
                created_paths.append(audio_path)
                records.append(record)
                ui_audio.append(
                    {
                        "filename": audio_path.name,
                        "subfolder": relative_folder.as_posix(),
                        "type": "output",
                    }
                )
        except Exception:
            for path in temporary_paths:
                path.unlink(missing_ok=True)
            for path in created_paths:
                path.unlink(missing_ok=True)
            raise

        save_elapsed = time.perf_counter() - save_started
        cleanup_elapsed = 0.0
        cleanup_report = "Cleanup left off for fast batch/reuse."
        if effective_cleanup:
            cleanup_started = time.perf_counter()
            cleanup_report = _cleanup_music_models()
            cleanup_elapsed = time.perf_counter() - cleanup_started
        names = ", ".join(record["filename"] for record in records)
        report = (
            f"Saved {len(records)} matched NovoLoko track set(s) under {relative_folder.as_posix()}: {names}. "
            f"Save stage {save_elapsed:.3f}s; cleanup stage {cleanup_elapsed:.3f}s; lifecycle {model_lifecycle}. {cleanup_report}"
        )
        metadata_output: Any = records[0] if len(records) == 1 else records
        return {
            "ui": {"audio": ui_audio, "text": [report]},
            "result": (audio, report, json.dumps(metadata_output, ensure_ascii=False)),
        }


class NovaMusicAudioLibrary:
    """Execution trigger for the non-blocking browser audio library frontend."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "refresh_trigger": ("STRING", {"forceInput": True}),
                "folder": (
                    "STRING",
                    {
                        "default": DEFAULT_AUDIO_FOLDER,
                        "tooltip": "NovoLoko output subfolder, or an external folder selected with Browse in the player.",
                    },
                ),
                "auto_play_new": ("BOOLEAN", {"default": True}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("library_status",)
    FUNCTION = "refresh"
    CATEGORY = "NovoLoko/Music/MiniMax Music 3"
    OUTPUT_NODE = True

    def refresh(self, refresh_trigger="", folder=DEFAULT_AUDIO_FOLDER, auto_play_new=True):
        try:
            library = list_music_library(folder, "newest", "")
            newest = library["tracks"][0]["name"] if library["tracks"] else ""
            report = f"NovoLoko Audio Library refreshed: {library['count']} track(s) in {library['folder']}."
            payload = {
                "folder": library["folder"],
                "newest": newest,
                "auto_play_new": _safe_bool(auto_play_new, True),
            }
        except Exception as error:
            report = f"NovoLoko Audio Library refresh needs attention: {error}"
            payload = {"folder": _clean_text(folder), "newest": "", "auto_play_new": False, "error": str(error)}
        return {"ui": {"nova_music_library": [payload], "text": [report]}, "result": (report,)}


def _music_controls_api_payload() -> Dict[str, Any]:
    catalog = load_music_catalog()
    return {
        "special_presets": [CUSTOM_PRESET, NONE_PRESET, RANDOM_PRESET],
        "special_choices": [NONE_OPTION, CUSTOM_OPTION, RANDOM_OPTION],
        "categories": [
            {
                "key": key,
                "label": spec["label"],
                "legacy_label": spec.get("legacy_label", spec["label"]),
                "description": spec.get("help", ""),
                "default": spec["default"],
                "options": [
                    {
                        "value": row["name"],
                        "label": _choice_display(key, row),
                        "description": row.get("description") or row.get("prompt", ""),
                    }
                    for row in catalog[key]
                ],
            }
            for key, spec in CATEGORY_SPECS.items()
        ],
        "presets": _preset_api_rows(),
        "song_ideas": load_song_ideas(),
        "user_preset_file": str(_user_presets_path()),
    }


def _register_music_routes() -> None:
    try:
        from aiohttp import web
        from server import PromptServer
    except (ImportError, AttributeError):
        return

    routes = PromptServer.instance.routes

    @routes.get("/nova_music3/controls")
    async def nova_music3_controls(_request):
        return web.json_response(_music_controls_api_payload())

    @routes.get("/nova_music3/ollama/models")
    async def nova_music3_ollama_models(_request):
        try:
            payload = await asyncio.to_thread(_ollama_model_catalog)
            return web.json_response({"ok": True, **payload})
        except (RuntimeError, ValueError, OSError) as error:
            return web.json_response(
                {
                    "ok": False,
                    "available": False,
                    "runtime": "Ollama model discovery failed.",
                    "models": [],
                    "missing_recommended": list(OLLAMA_RECOMMENDED),
                    "error": str(error),
                },
                status=503,
            )

    @routes.post("/nova_music3/presets")
    async def nova_music3_presets(request):
        try:
            body = await request.json()
            action = _clean_text(body.get("action")).lower()
            if action == "save":
                values = dict(body.get("selections") or {})
                for key, value in dict(body.get("custom_values") or {}).items():
                    values[f"custom_{key}"] = value
                values["allow_random_none"] = body.get("allow_random_none", False)
                values["random_preset_scope"] = body.get("random_preset_scope", "Off")
                values["random_preset_filter"] = body.get("random_preset_filter", "")
                values["seed_after_run"] = body.get("seed_after_run", "Fixed")
                result = save_user_music_preset(
                    body.get("name"),
                    preset=body.get("preset", CUSTOM_PRESET),
                    randomize_all=body.get("randomize_all", False),
                    seed=body.get("seed", 0),
                    overwrite=body.get("overwrite", False),
                    **values,
                )
            elif action == "rename":
                result = rename_user_music_preset(body.get("name"), body.get("new_name"))
            elif action == "delete":
                result = {"deleted": delete_user_music_preset(body.get("name"))}
            else:
                raise ValueError("Unknown preset action.")
            return web.json_response({"ok": True, "result": result, "controls": _music_controls_api_payload()})
        except FileExistsError as error:
            return web.json_response({"ok": False, "error": str(error), "code": "exists"}, status=409)
        except (ValueError, FileNotFoundError, PermissionError, OSError) as error:
            return web.json_response({"ok": False, "error": str(error)}, status=400)

    @routes.get("/nova_music3/library")
    async def nova_music3_library(request):
        try:
            payload = await asyncio.to_thread(
                list_music_library,
                request.query.get("folder", DEFAULT_AUDIO_FOLDER),
                request.query.get("sort", "newest"),
                request.query.get("search", ""),
                request.query.get("favorites_only", "false"),
            )
            return web.json_response(payload)
        except (ValueError, FileNotFoundError, PermissionError, OSError) as error:
            return web.json_response({"error": str(error)}, status=400)

    @routes.get("/nova_music3/library/file")
    async def nova_music3_library_file(request):
        try:
            folder, _label, _external = _resolve_library_folder(request.query.get("folder", DEFAULT_AUDIO_FOLDER))
            path = _safe_library_audio(folder, request.query.get("name"))
            return web.FileResponse(path)
        except (ValueError, FileNotFoundError, PermissionError, OSError) as error:
            return web.json_response({"error": str(error)}, status=404)

    @routes.get("/nova_music3/library/sidecar")
    async def nova_music3_library_sidecar(request):
        try:
            payload = await asyncio.to_thread(
                load_music_library_sidecar,
                request.query.get("folder", DEFAULT_AUDIO_FOLDER),
                request.query.get("name"),
            )
            return web.json_response({"ok": True, **payload})
        except (ValueError, FileNotFoundError, PermissionError, OSError) as error:
            return web.json_response({"ok": False, "error": str(error)}, status=404)

    @routes.post("/nova_music3/library/browse")
    async def nova_music3_library_browse(_request):
        def choose() -> str:
            import tkinter
            from tkinter import filedialog

            root = tkinter.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            try:
                return _clean_text(filedialog.askdirectory(title="Choose a NovoLoko audio library folder"))
            finally:
                root.destroy()

        try:
            selected = await asyncio.to_thread(choose)
            if not selected:
                return web.json_response({"ok": True, "cancelled": True})
            resolved = Path(selected).resolve()
            if not resolved.is_dir():
                raise FileNotFoundError("The selected folder is unavailable.")
            with _EXTERNAL_LIBRARY_LOCK:
                _EXTERNAL_LIBRARY_ROOTS.add(resolved)
            return web.json_response({"ok": True, "folder": str(resolved)})
        except (ImportError, OSError, RuntimeError) as error:
            return web.json_response({"ok": False, "error": str(error)}, status=400)

    @routes.post("/nova_music3/library/rename")
    async def nova_music3_library_rename(request):
        try:
            body = await request.json()
            result = await asyncio.to_thread(
                rename_music_library_track,
                body.get("folder", DEFAULT_AUDIO_FOLDER),
                body.get("name"),
                body.get("new_name"),
            )
            return web.json_response({"ok": True, **result})
        except (ValueError, FileNotFoundError, FileExistsError, PermissionError, OSError) as error:
            return web.json_response({"ok": False, "error": str(error)}, status=400)

    @routes.post("/nova_music3/library/favorite")
    async def nova_music3_library_favorite(request):
        try:
            body = await request.json()
            result = await asyncio.to_thread(
                set_music_library_favorite,
                body.get("folder", DEFAULT_AUDIO_FOLDER),
                body.get("name"),
                body.get("favorite", True),
            )
            return web.json_response({"ok": True, **result})
        except (ValueError, FileNotFoundError, PermissionError, OSError) as error:
            return web.json_response({"ok": False, "error": str(error)}, status=400)

    @routes.post("/nova_music3/library/delete")
    async def nova_music3_library_delete(request):
        try:
            body = await request.json()
            if not _safe_bool(body.get("confirmed"), False):
                raise ValueError("Deletion confirmation is required.")
            result = await asyncio.to_thread(
                trash_music_library_track,
                body.get("folder", DEFAULT_AUDIO_FOLDER),
                body.get("name"),
            )
            return web.json_response({"ok": True, **result})
        except (ValueError, FileNotFoundError, PermissionError, OSError) as error:
            return web.json_response({"ok": False, "error": str(error)}, status=400)

    @routes.post("/nova_music3/library/reveal")
    async def nova_music3_library_reveal(request):
        try:
            body = await request.json()
            result = await asyncio.to_thread(
                reveal_music_library_track,
                body.get("folder", DEFAULT_AUDIO_FOLDER),
                body.get("name"),
            )
            return web.json_response({"ok": True, **result})
        except (ValueError, FileNotFoundError, PermissionError, OSError) as error:
            return web.json_response({"ok": False, "error": str(error)}, status=400)

    @routes.post("/nova_music3/library/open")
    async def nova_music3_library_open(request):
        try:
            body = await request.json()
            folder, label, _external = _resolve_library_folder(body.get("folder", DEFAULT_AUDIO_FOLDER))
            folder.mkdir(parents=True, exist_ok=True)
            if not hasattr(os, "startfile"):
                raise OSError("Open Folder is available on Windows.")
            await asyncio.to_thread(os.startfile, str(folder))
            return web.json_response({"ok": True, "folder": label})
        except (ValueError, FileNotFoundError, PermissionError, OSError) as error:
            return web.json_response({"ok": False, "error": str(error)}, status=400)


_register_music_routes()


NODE_CLASS_MAPPINGS = {
    "NovaMusicIdea": NovaMusicIdea,
    "NovaMusicControls": NovaMusicControls,
    "NovaMusicWriterOllamaLoader": NovaMusicWriterOllamaLoader,
    "NovaMusicWriterBackendSelector": NovaMusicWriterBackendSelector,
    "NovaMusicLyricEnhancer": NovaMusicLyricEnhancer,
    "NovaMusicLyricsGenerator": NovaMusicLyricsGenerator,
    "NovaMusicCaptionEnhancer": NovaMusicCaptionEnhancer,
    "NovaMusicSaveAudioMetadata": NovaMusicSaveAudioMetadata,
    "NovaMusicAudioLibrary": NovaMusicAudioLibrary,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NovaMusicIdea": "NovoLoko Music Idea",
    "NovaMusicControls": "NovoLoko MiniMax Music 3 Controls",
    "NovaMusicWriterOllamaLoader": "NovoLoko Music Writer Loader (Ollama GGUF)",
    "NovaMusicWriterBackendSelector": "NovoLoko Music Writer Backend / Model Selector",
    "NovaMusicLyricEnhancer": "NovoLoko Lyric Enhancer",
    "NovaMusicLyricsGenerator": "NovoLoko Lyrics Generator",
    "NovaMusicCaptionEnhancer": "NovoLoko Music Caption Enhancer",
    "NovaMusicSaveAudioMetadata": "NovoLoko Save Audio + Prompt Metadata",
    "NovaMusicAudioLibrary": "NovoLoko Audio Library / Player",
}
