import json
import os
import random
import re
import time
from typing import Dict, List, Tuple

from .nodes import (
    DEFAULT_CSV,
    _candidate_csv_paths,
    _is_no_style_name,
    _node_dir,
    _read_styles,
    _resolve_csv_path,
    _strip_number,
    _trigger_from_name,
    _weighted_choice,
)

SEARCH_HELP_TEXT = 'Search: word or "exact phrase" | Exclude: -word or -"exact phrase"'
ALL_FOLDERS = "All folders"
_LIBRARY_FILES_CACHE = []
_LIBRARY_FILES_CACHE_AT = 0.0

LEGACY_SLOTS = ("medium", "pose", "action", "clothing", "location", "character")
SLOTS = ("medium", "subject", "pose", "action", "clothing", "location", "character")
OUTPUT_SLOTS = LEGACY_SLOTS + ("subject",)
SEED_SLOT_INDEX = {
    "medium": 0,
    "pose": 1,
    "action": 2,
    "clothing": 3,
    "location": 4,
    "character": 5,
    "subject": 6,
}

DEFAULT_FILES = {
    "medium": "csv/wildcards/novoloko_uploaded_styles_master_397_FINAL.csv",
    "subject": "csv/subjects/novoloko_subjects_master_3600.csv",
    "pose": "csv/poses/novoloko_poses_1500.csv",
    "action": "csv/actions/novoloko_actions_1500.csv",
    "clothing": "csv/clothing/novoloko_clothing_hair_expanded_5800.csv",
    "location": "csv/locations/novoloko_locations_expanded_global_3846.csv",
    "character": "csv/characters/novoloko_characters_master_3200.csv",
}

SLOT_LABELS = {
    "medium": "Medium",
    "subject": "Subject",
    "pose": "Pose",
    "action": "Action",
    "clothing": "Clothing",
    "location": "Location",
    "character": "Character",
}

RANDOM_NAMES = {"random", "random style", "random entry", "random selection"}
NONE_NAMES = {
    "none",
    "off",
    "no style",
    "no character",
    "no character/none",
    "no subject",
    "no subject/none",
}


def _restore_menu_value(value: str) -> str:
    text = str(value or "")
    text = text.replace("／", "/")
    text = text.replace("›", "/")
    text = text.replace("⟩", "/")
    text = re.sub(r"\s*/\s*", "/", text)
    return text.strip()


def _clean_key(value: str) -> str:
    restored = _restore_menu_value(value)
    return " ".join(_strip_number(restored).strip().lower().replace("_", " ").split())


def _is_random_name(value: str) -> bool:
    return _clean_key(value) in RANDOM_NAMES


def _is_none_name(value: str) -> bool:
    clean = _clean_key(value)
    return not clean or clean in NONE_NAMES or _is_no_style_name(value)


def _match_record(records: List[Dict], requested: str):
    requested = str(requested or "").strip()
    if not requested:
        return None

    exact = next((r for r in records if str(r.get("name", "")).strip() == requested), None)
    if exact is not None:
        return exact

    clean = _clean_key(requested)
    exact_clean = next((r for r in records if _clean_key(r.get("name", "")) == clean), None)
    if exact_clean is not None:
        return exact_clean

    contains = next((r for r in records if clean and clean in _clean_key(r.get("name", ""))), None)
    if contains is not None:
        return contains

    return next(
        (
            r for r in records
            if clean
            and (
                clean in _trigger_from_name(str(r.get("name", ""))).lower()
                or clean in str(r.get("prompt", "")).lower()
            )
        ),
        None,
    )


def _usable_random_records(records: List[Dict]) -> List[Dict]:
    out = []
    for rec in records:
        name = str(rec.get("name", "")).strip()
        if _is_none_name(name) or _is_random_name(name):
            continue
        if not str(rec.get("prompt", "")).strip() and not str(rec.get("negative", "")).strip():
            continue
        out.append(rec)
    return out


def _parse_search_terms(search: str) -> Tuple[List[str], List[str]]:
    includes = []
    excludes = []
    text = str(search or "")
    index = 0
    length = len(text)

    while index < length:
        while index < length and text[index].isspace():
            index += 1
        if index >= length:
            break

        excluded = text[index] == "-"
        if excluded:
            index += 1
            if index >= length or text[index].isspace():
                continue

        if text[index] == '"':
            index += 1
            end = text.find('"', index)
            if end < 0:
                term = text[index:]
                index = length
            else:
                term = text[index:end]
                index = end + 1
        else:
            end = index
            while end < length and not text[end].isspace():
                end += 1
            term = text[index:end]
            index = end

        term = term.strip().casefold()
        if not term:
            continue
        (excludes if excluded else includes).append(term)

    return includes, excludes


def _matches_search(record: Dict, search: str) -> bool:
    includes, excludes = _parse_search_terms(search)
    if not includes and not excludes:
        return True

    haystack = "\n".join(
        str(record.get(field, "") or "")
        for field in ("name", "prompt", "category", "negative", "negative_prompt")
    ).casefold()
    # Multiple positive terms narrow the result together; quoted phrases remain
    # one term. This keeps searches such as "Ferrari F40" precise after large
    # libraries add many other Ferrari entries.
    includes_match = not includes or all(term in haystack for term in includes)
    excludes_match = not any(term in haystack for term in excludes)
    return includes_match and excludes_match


def _filtered_records(records: List[Dict], category: str = "All", search: str = "") -> List[Dict]:
    category = _restore_menu_value(category) or "All"
    search = str(search or "").strip()
    if category == "All" and not search:
        return list(records)
    # Frontend menu presentation flattens category separators, while curated
    # CSVs may contain readable spaces around "/". Compare their normalized
    # forms here instead of requiring identical whitespace.
    candidates = [dict(record) for record in records]
    if category != "All":
        broad = category.rstrip("/")
        candidates = [
            record
            for record in candidates
            if (
                _restore_menu_value(record.get("category", "")) == broad
                or _restore_menu_value(record.get("category", "")).startswith(broad + "/")
            )
        ]
    if search:
        candidates = [record for record in candidates if _matches_search(record, search)]
    return candidates


def _pick_record(
    file_path: str,
    selection: str,
    rng: random.Random,
    category: str = "All",
    search: str = "",
) -> Tuple[Dict, str]:
    records = _read_styles(file_path)
    selection = _restore_menu_value(selection) or "none"

    if _is_none_name(selection):
        return {
            "name": "none",
            "prompt": "",
            "negative": "",
            "category": "None",
            "weight": 0.0,
        }, _resolve_csv_path(file_path)

    if _is_random_name(selection):
        candidates = _usable_random_records(_filtered_records(records, category, search))
        if not candidates:
            return {
                "name": "none",
                "prompt": "",
                "negative": "",
                "category": "None",
                "weight": 0.0,
            }, _resolve_csv_path(file_path)
        return _weighted_choice(rng, candidates), _resolve_csv_path(file_path)

    # Match the visible filtered list first, then the complete file. This keeps
    # saved workflows valid when the user later changes a search/category filter.
    matched = _match_record(_filtered_records(records, category, search), selection)
    if matched is None:
        matched = _match_record(records, selection)
    if matched is None:
        raise ValueError(
            f"Selection '{selection}' was not found in {file_path}. "
            "Press Refresh Files + Dropdowns on the node and select it again."
        )
    return matched, _resolve_csv_path(file_path)


def _apply_template(template: str, downstream: str, delimiter: str) -> str:
    template = str(template or "").strip()
    downstream = str(downstream or "").strip()

    if not template:
        return downstream

    if "{prompt}" in template:
        return template.replace("{prompt}", downstream).strip()

    if not downstream:
        return template
    return f"{template}{delimiter}{downstream}".strip()


def _dedupe_negative(parts: List[str], delimiter: str) -> str:
    seen = set()
    out = []
    for part in parts:
        for chunk in str(part or "").split(","):
            clean = " ".join(chunk.strip().split())
            key = clean.lower()
            if clean and key not in seen:
                seen.add(key)
                out.append(clean)
    return delimiter.join(out)


def _build_stack(
    slot_values: Dict[str, Dict[str, str]],
    random_mode="Random Every Queue",
    seed=0,
    delimiter=", ",
    manual_prompt="",
    extra_positive="",
    extra_negative="",
    all_slots_enabled=True,
    manual_prompt_input=None,
    slots=LEGACY_SLOTS,
):
    delimiter = str(delimiter if delimiter is not None else ", ") or ", "

    base_manual = (
        str(manual_prompt_input).strip()
        if manual_prompt_input is not None and str(manual_prompt_input).strip()
        else str(manual_prompt or "").strip()
    )
    extra_positive = str(extra_positive or "").strip()
    current = delimiter.join([part for part in (base_manual, extra_positive) if part])

    selected = {}
    negatives = []
    resolved = {}
    base_seed = int(seed)
    slots_enabled = bool(all_slots_enabled)

    if slots_enabled:
        for slot in slots:
            values = slot_values[slot]
            if str(random_mode) == "Random Every Queue":
                rng = random.Random(
                    time.time_ns()
                    ^ (SEED_SLOT_INDEX[slot] * 0x9E3779B97F4A7C15)
                )
            else:
                rng = random.Random(base_seed + SEED_SLOT_INDEX[slot] * 1000003)

            record, resolved_path = _pick_record(
                values["file_path"],
                values["selection"],
                rng,
                values.get("category", "All"),
                values.get("search", ""),
            )
            selected[slot] = record
            resolved[slot] = resolved_path
            negative = str(record.get("negative", "")).strip()
            if negative:
                negatives.append(negative)

        for slot in reversed(slots):
            current = _apply_template(selected[slot].get("prompt", ""), current, delimiter)
    else:
        for slot in slots:
            selected[slot] = {
                "name": "off",
                "prompt": "",
                "negative": "",
                "category": "Bypassed",
                "weight": 0.0,
            }
            resolved[slot] = "ALL SLOTS BYPASSED"

    if extra_negative:
        negatives.append(str(extra_negative).strip())
    combined_negative = _dedupe_negative(negatives, delimiter)

    names = {
        slot: str(selected[slot].get("name", "none")).strip() or "none"
        for slot in slots
    }
    summary_lines = [
        "NovoLoko Prompt Stack AIO Pro",
        f"ALL SLOTS: {'ON' if slots_enabled else 'OFF — selections preserved'}",
        "Order: " + " > ".join(SLOT_LABELS[slot] for slot in slots) + " > Manual Prompt",
    ]
    for slot in slots:
        values = slot_values[slot]
        filter_bits = []
        if str(values.get("category", "All")) != "All":
            filter_bits.append(f"category={values.get('category')}")
        if str(values.get("search", "")).strip():
            filter_bits.append(f"search={values.get('search')}")
        filters = f" | {'; '.join(filter_bits)}" if filter_bits else ""
        summary_lines.append(
            f"{SLOT_LABELS[slot]}: {names[slot]} | {os.path.basename(resolved[slot])}{filters}"
        )
    summary_lines.append(f"Manual prompt: {base_manual if base_manual else 'EMPTY'}")
    summary_lines.append(f"Combined prompt: {current if current else 'EMPTY'}")

    output_slots = tuple(slot for slot in OUTPUT_SLOTS if slot in slots)
    return (
        current,
        combined_negative,
        "\n".join(summary_lines),
        *(names[slot] for slot in output_slots),
    )


def _as_enabled(value, default=True) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return bool(default)
    return str(value).strip().lower() not in {"0", "false", "no", "off", "disabled"}


def _normalise_dynamic_slots(slots_json):
    """Return a validated dynamic slot list, or None when legacy fields should be used."""
    text = str(slots_json or "").strip()
    if not text:
        return None
    try:
        payload = json.loads(text)
    except (TypeError, ValueError):
        return None

    raw_slots = payload.get("slots") if isinstance(payload, dict) else payload
    if not isinstance(raw_slots, list):
        return None

    slots = []
    for index, raw in enumerate(raw_slots):
        if not isinstance(raw, dict):
            continue
        legacy_key = str(raw.get("legacy_key", "")).strip().lower()
        default_file = DEFAULT_FILES.get(legacy_key, DEFAULT_CSV)
        try:
            seed_offset = int(raw.get("seed_offset", index))
        except (TypeError, ValueError):
            seed_offset = index
        slots.append({
            "id": str(raw.get("id", f"slot-{index + 1}")),
            "label": str(raw.get("label", f"Slot {index + 1}")).strip() or f"Slot {index + 1}",
            "legacy_key": legacy_key,
            "enabled": _as_enabled(raw.get("enabled"), True),
            "file_path": str(raw.get("file_path", default_file)).strip() or default_file,
            # Frontend-only navigation state is accepted here so old and new
            # slots_json payloads can use the same versioned transport. Folder
            # selection never changes how an already-selected file executes.
            "folder": str(raw.get("folder", ALL_FOLDERS)).strip() or ALL_FOLDERS,
            "folder_search": str(raw.get("folder_search", "")),
            "category": str(raw.get("category", "All")).strip() or "All",
            "search": str(raw.get("search", "")),
            "selection": str(raw.get("selection", "none")).strip() or "none",
            "seed_offset": max(0, seed_offset),
        })
    return slots


def _legacy_dynamic_slots(kwargs):
    slots = []
    for index, slot in enumerate(SLOTS):
        slots.append({
            "id": f"legacy-{slot}",
            "label": SLOT_LABELS[slot],
            "legacy_key": slot,
            "enabled": True,
            "file_path": kwargs.get(f"{slot}_file_path", DEFAULT_FILES[slot]),
            "folder": ALL_FOLDERS,
            "folder_search": "",
            "category": kwargs.get(f"{slot}_category", "All"),
            "search": kwargs.get(f"{slot}_search", ""),
            "selection": kwargs.get(
                f"{slot}_selection",
                "none" if slot == "subject" else "random",
            ),
            # Keep v4.0.0 seeded choices identical after migration.
            "seed_offset": SEED_SLOT_INDEX.get(slot, index),
        })
    return slots


def _build_dynamic_stack(
    dynamic_slots,
    random_mode="Random Every Queue",
    seed=0,
    delimiter=", ",
    manual_prompt="",
    extra_positive="",
    extra_negative="",
    all_slots_enabled=True,
    manual_prompt_input=None,
):
    delimiter = str(delimiter if delimiter is not None else ", ") or ", "
    base_manual = (
        str(manual_prompt_input).strip()
        if manual_prompt_input is not None and str(manual_prompt_input).strip()
        else str(manual_prompt or "").strip()
    )
    extra_positive = str(extra_positive or "").strip()
    current = delimiter.join(part for part in (base_manual, extra_positive) if part)
    base_seed = int(seed)
    master_enabled = bool(all_slots_enabled)
    selected = []
    negatives = []

    for index, slot in enumerate(dynamic_slots):
        enabled = master_enabled and _as_enabled(slot.get("enabled"), True)
        if not enabled:
            selected.append({
                "slot": slot,
                "record": {"name": "off", "prompt": "", "negative": ""},
                "resolved": "BYPASSED",
                "enabled": False,
            })
            continue

        offset = max(0, int(slot.get("seed_offset", index)))
        if str(random_mode) == "Random Every Queue":
            rng = random.Random(time.time_ns() ^ (offset * 0x9E3779B97F4A7C15))
        else:
            rng = random.Random(base_seed + offset * 1000003)
        record, resolved_path = _pick_record(
            slot["file_path"],
            slot["selection"],
            rng,
            slot.get("category", "All"),
            slot.get("search", ""),
        )
        selected.append({
            "slot": slot,
            "record": record,
            "resolved": resolved_path,
            "enabled": True,
        })
        negative = str(record.get("negative", "")).strip()
        if negative:
            negatives.append(negative)

    for item in reversed(selected):
        if item["enabled"]:
            current = _apply_template(item["record"].get("prompt", ""), current, delimiter)

    if extra_negative:
        negatives.append(str(extra_negative).strip())
    combined_negative = _dedupe_negative(negatives, delimiter)

    summary_lines = [
        "NovoLoko Prompt Stack AIO Pro - Dynamic Slots",
        f"ALL SLOTS: {'ON' if master_enabled else 'OFF - selections preserved'}",
        "Order: " + (
            " > ".join(str(item["slot"]["label"]) for item in selected) + " > Manual Prompt"
            if selected else "Manual Prompt"
        ),
    ]
    clean_names = []
    for item in selected:
        slot = item["slot"]
        record = item["record"]
        name = str(record.get("name", "none")).strip() or "none"
        filter_bits = []
        if str(slot.get("category", "All")) != "All":
            filter_bits.append(f"category={slot.get('category')}")
        if str(slot.get("search", "")).strip():
            filter_bits.append(f"search={slot.get('search')}")
        filters = f" | {'; '.join(filter_bits)}" if filter_bits else ""
        state = "ON" if item["enabled"] else "OFF"
        summary_lines.append(
            f"{slot['label']} [{state}]: {name} | {os.path.basename(item['resolved'])}{filters}"
        )
        if item["enabled"] and not _is_none_name(name) and not _is_random_name(name):
            clean_names.append(name)
    summary_lines.append(f"Manual prompt: {base_manual if base_manual else 'EMPTY'}")
    summary_lines.append(f"Combined prompt: {current if current else 'EMPTY'}")

    # all_names is intentionally newline-only and contains no UI or prompt metadata.
    return current, combined_negative, "\n".join(summary_lines), "\n".join(clean_names)


class NovaPromptStackAIOV1:
    """Compatibility version used by v2.6 workflows."""

    @classmethod
    def INPUT_TYPES(cls):
        required = {
            "all_slots_enabled": (
                "BOOLEAN",
                {
                    "default": True,
                    "label_on": "ALL SLOTS ON",
                    "label_off": "ALL SLOTS OFF",
                },
            ),
        }
        for slot in LEGACY_SLOTS:
            required[f"{slot}_file_path"] = (
                "STRING",
                {"default": DEFAULT_FILES[slot], "multiline": False},
            )
            required[f"{slot}_selection"] = (
                "STRING",
                {"default": "none", "multiline": False},
            )

        required.update(
            {
                "random_mode": (
                    ["Random Every Queue", "Random From Seed"],
                    {"default": "Random Every Queue"},
                ),
                "seed": (
                    "INT",
                    {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF},
                ),
                "delimiter": ("STRING", {"default": ", ", "multiline": False}),
                "manual_prompt": ("STRING", {"default": "", "multiline": True}),
                "extra_positive": ("STRING", {"default": "", "multiline": True}),
                "extra_negative": ("STRING", {"default": "", "multiline": True}),
            }
        )
        return {
            "required": required,
            "optional": {"manual_prompt_input": ("STRING", {"forceInput": True})},
        }

    RETURN_TYPES = ("STRING",) * 9
    RETURN_NAMES = (
        "combined_prompt",
        "combined_negative",
        "selected_summary",
        "medium_name",
        "pose_name",
        "action_name",
        "clothing_name",
        "location_name",
        "character_name",
    )
    FUNCTION = "build"
    CATEGORY = "NovoLoko/Prompt"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        random_mode = str(kwargs.get("random_mode", "Random Every Queue"))
        all_slots_enabled = bool(kwargs.get("all_slots_enabled", True))
        any_random = all_slots_enabled and any(
            _is_random_name(kwargs.get(f"{slot}_selection", "")) for slot in LEGACY_SLOTS
        )
        if any_random and random_mode == "Random Every Queue":
            return time.time_ns()
        mtimes = []
        if all_slots_enabled:
            for slot in LEGACY_SLOTS:
                value = kwargs.get(f"{slot}_file_path", DEFAULT_FILES[slot])
                try:
                    resolved = _resolve_csv_path(value)
                    mtimes.append((resolved, os.path.getmtime(resolved)))
                except Exception:
                    mtimes.append((str(value), 0))
        else:
            mtimes.append(("ALL SLOTS OFF", 0))
        return (
            tuple(mtimes),
            tuple(kwargs.get(f"{slot}_selection", "none") for slot in LEGACY_SLOTS),
            kwargs.get("all_slots_enabled", True),
            kwargs.get("random_mode"),
            kwargs.get("seed"),
            kwargs.get("delimiter"),
            kwargs.get("manual_prompt"),
            kwargs.get("manual_prompt_input"),
            kwargs.get("extra_positive"),
            kwargs.get("extra_negative"),
        )

    def build(
        self,
        medium_file_path,
        medium_selection,
        pose_file_path,
        pose_selection,
        action_file_path,
        action_selection,
        clothing_file_path,
        clothing_selection,
        location_file_path,
        location_selection,
        character_file_path,
        character_selection,
        all_slots_enabled=True,
        random_mode="Random Every Queue",
        seed=0,
        delimiter=", ",
        manual_prompt="",
        extra_positive="",
        extra_negative="",
        manual_prompt_input=None,
    ):
        slot_values = {
            slot: {
                "file_path": locals()[f"{slot}_file_path"],
                "selection": locals()[f"{slot}_selection"],
                "category": "All",
                "search": "",
            }
            for slot in LEGACY_SLOTS
        }
        return _build_stack(
            slot_values,
            random_mode,
            seed,
            delimiter,
            manual_prompt,
            extra_positive,
            extra_negative,
            all_slots_enabled,
            manual_prompt_input,
        )


class NovaPromptStackAIOV2:
    """Six-slot CSV/YAML stack with live file, category and style dropdowns."""

    @classmethod
    def INPUT_TYPES(cls):
        required = {
            "all_slots_enabled": (
                "BOOLEAN",
                {
                    "default": True,
                    "label_on": "ALL SLOTS ON",
                    "label_off": "ALL SLOTS OFF",
                },
            ),
        }
        for slot in LEGACY_SLOTS:
            # Strings are converted to live combos by the frontend. Keeping the
            # backend validation type as STRING means newly added files and saved
            # values do not invalidate old workflows.
            required[f"{slot}_file_path"] = (
                "STRING",
                {"default": DEFAULT_FILES[slot], "multiline": False},
            )
            required[f"{slot}_category"] = (
                "STRING",
                {"default": "All", "multiline": False},
            )
            required[f"{slot}_search"] = (
                "STRING",
                {"default": "", "multiline": False, "tooltip": SEARCH_HELP_TEXT},
            )
            required[f"{slot}_selection"] = (
                "STRING",
                {"default": "random", "multiline": False},
            )

        required.update(
            {
                "random_mode": (
                    ["Random Every Queue", "Random From Seed"],
                    {"default": "Random Every Queue"},
                ),
                "seed": (
                    "INT",
                    {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF},
                ),
                "delimiter": ("STRING", {"default": ", ", "multiline": False}),
                "manual_prompt": ("STRING", {"default": "", "multiline": True}),
                "extra_positive": ("STRING", {"default": "", "multiline": True}),
                "extra_negative": ("STRING", {"default": "", "multiline": True}),
            }
        )
        return {
            "required": required,
            "optional": {"manual_prompt_input": ("STRING", {"forceInput": True})},
        }

    RETURN_TYPES = ("STRING",) * 9
    RETURN_NAMES = NovaPromptStackAIOV1.RETURN_NAMES
    FUNCTION = "build"
    CATEGORY = "NovoLoko/Prompt"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        random_mode = str(kwargs.get("random_mode", "Random Every Queue"))
        all_slots_enabled = bool(kwargs.get("all_slots_enabled", True))
        any_random = all_slots_enabled and any(
            _is_random_name(kwargs.get(f"{slot}_selection", "")) for slot in LEGACY_SLOTS
        )
        if any_random and random_mode == "Random Every Queue":
            return time.time_ns()
        mtimes = []
        if all_slots_enabled:
            for slot in LEGACY_SLOTS:
                value = kwargs.get(f"{slot}_file_path", DEFAULT_FILES[slot])
                try:
                    resolved = _resolve_csv_path(value)
                    mtimes.append((resolved, os.path.getmtime(resolved)))
                except Exception:
                    mtimes.append((str(value), 0))
        else:
            mtimes.append(("ALL SLOTS OFF", 0))
        return (
            tuple(mtimes),
            tuple(
                (
                    kwargs.get(f"{slot}_category", "All"),
                    kwargs.get(f"{slot}_search", ""),
                    kwargs.get(f"{slot}_selection", "random"),
                )
                for slot in LEGACY_SLOTS
            ),
            kwargs.get("all_slots_enabled", True),
            kwargs.get("random_mode"),
            kwargs.get("seed"),
            kwargs.get("delimiter"),
            kwargs.get("manual_prompt"),
            kwargs.get("manual_prompt_input"),
            kwargs.get("extra_positive"),
            kwargs.get("extra_negative"),
        )

    def build(
        self,
        medium_file_path,
        medium_category,
        medium_search,
        medium_selection,
        pose_file_path,
        pose_category,
        pose_search,
        pose_selection,
        action_file_path,
        action_category,
        action_search,
        action_selection,
        clothing_file_path,
        clothing_category,
        clothing_search,
        clothing_selection,
        location_file_path,
        location_category,
        location_search,
        location_selection,
        character_file_path,
        character_category,
        character_search,
        character_selection,
        all_slots_enabled=True,
        random_mode="Random Every Queue",
        seed=0,
        delimiter=", ",
        manual_prompt="",
        extra_positive="",
        extra_negative="",
        manual_prompt_input=None,
    ):
        local_values = locals()
        slot_values = {
            slot: {
                "file_path": local_values[f"{slot}_file_path"],
                "category": local_values[f"{slot}_category"],
                "search": local_values[f"{slot}_search"],
                "selection": local_values[f"{slot}_selection"],
            }
            for slot in LEGACY_SLOTS
        }
        return _build_stack(
            slot_values,
            random_mode,
            seed,
            delimiter,
            manual_prompt,
            extra_positive,
            extra_negative,
            all_slots_enabled,
            manual_prompt_input,
        )



class NovaPromptStackAIOV3(NovaPromptStackAIOV2):
    """Native-combo version for reliable dropdowns in modern ComfyUI frontends."""

    @classmethod
    def INPUT_TYPES(cls):
        required = {
            "all_slots_enabled": (
                "BOOLEAN",
                {
                    "default": True,
                    "label_on": "ALL SLOTS ON",
                    "label_off": "ALL SLOTS OFF",
                },
            ),
        }
        for slot in LEGACY_SLOTS:
            files = _slot_file_candidates(slot)
            default_file = DEFAULT_FILES[slot]
            if default_file not in files:
                files.insert(0, default_file)

            # These are real COMBO widgets from creation time. The frontend only
            # replaces their value lists; it no longer converts STRING widgets.
            required[f"{slot}_file_path"] = (
                files or [default_file],
                {"default": default_file},
            )
            required[f"{slot}_category"] = (
                ["All"],
                {"default": "All"},
            )
            required[f"{slot}_search"] = (
                "STRING",
                {"default": "", "multiline": False, "tooltip": SEARCH_HELP_TEXT},
            )
            required[f"{slot}_selection"] = (
                ["none", "random"],
                {"default": "random"},
            )

        required.update(
            {
                "random_mode": (
                    ["Random Every Queue", "Random From Seed"],
                    {"default": "Random Every Queue"},
                ),
                "seed": (
                    "INT",
                    {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF},
                ),
                "delimiter": ("STRING", {"default": ", ", "multiline": False}),
                "manual_prompt": ("STRING", {"default": "", "multiline": True}),
                "extra_positive": ("STRING", {"default": "", "multiline": True}),
                "extra_negative": ("STRING", {"default": "", "multiline": True}),
            }
        )
        # Compatibility: Subject is appended after every released v3.3.0 widget.
        # The frontend presents it beside Medium without changing this serialized
        # order, so old workflow widget arrays retain their original meaning.
        subject_files = _slot_file_candidates("subject")
        subject_default = DEFAULT_FILES["subject"]
        if subject_default not in subject_files:
            subject_files.insert(0, subject_default)
        required.update(
            {
                "subject_file_path": (
                    subject_files or [subject_default],
                    {"default": subject_default},
                ),
                "subject_category": (["All"], {"default": "All"}),
                "subject_search": (
                    "STRING",
                    {"default": "", "multiline": False, "tooltip": SEARCH_HELP_TEXT},
                ),
                "subject_selection": (
                    ["none", "random"],
                    {"default": "none"},
                ),
                # Appended after every released widget so legacy workflow arrays
                # keep their exact meaning. The frontend hides this transport
                # value and presents it as a repeatable, reorderable slot list.
                "slots_json": (
                    "STRING",
                    {"default": "", "multiline": False},
                ),
            }
        )
        return {
            "required": required,
            "optional": {"manual_prompt_input": ("STRING", {"forceInput": True})},
        }

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        # Category and entry lists are updated live by the frontend. Accept
        # saved and newly loaded values even when they were not in the small
        # initial combo lists returned above.
        return True

    RETURN_TYPES = ("STRING",) * 4
    RETURN_NAMES = (
        "combined_prompt",
        "combined_negative",
        "selected_summary",
        "all_names",
    )

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        random_mode = str(kwargs.get("random_mode", "Random Every Queue"))
        all_slots_enabled = bool(kwargs.get("all_slots_enabled", True))
        dynamic_slots = _normalise_dynamic_slots(kwargs.get("slots_json"))
        slots = dynamic_slots if dynamic_slots is not None else _legacy_dynamic_slots(kwargs)
        any_random = all_slots_enabled and any(
            _as_enabled(slot.get("enabled"), True)
            and _is_random_name(slot.get("selection", ""))
            for slot in slots
        )
        if any_random and random_mode == "Random Every Queue":
            return time.time_ns()
        mtimes = []
        if all_slots_enabled:
            for slot in slots:
                if not _as_enabled(slot.get("enabled"), True):
                    continue
                value = slot.get("file_path", DEFAULT_CSV)
                try:
                    resolved = _resolve_csv_path(value)
                    mtimes.append((resolved, os.path.getmtime(resolved)))
                except Exception:
                    mtimes.append((str(value), 0))
        else:
            mtimes.append(("ALL SLOTS OFF", 0))
        return (
            tuple(mtimes),
            tuple(
                (
                    slot.get("id"),
                    slot.get("label"),
                    slot.get("enabled"),
                    slot.get("category", "All"),
                    slot.get("search", ""),
                    slot.get("selection", "none"),
                    slot.get("seed_offset"),
                )
                for slot in slots
            ),
            kwargs.get("slots_json"),
            kwargs.get("all_slots_enabled", True),
            kwargs.get("random_mode"),
            kwargs.get("seed"),
            kwargs.get("delimiter"),
            kwargs.get("manual_prompt"),
            kwargs.get("manual_prompt_input"),
            kwargs.get("extra_positive"),
            kwargs.get("extra_negative"),
        )

    def build(
        self,
        medium_file_path,
        medium_category,
        medium_search,
        medium_selection,
        pose_file_path,
        pose_category,
        pose_search,
        pose_selection,
        action_file_path,
        action_category,
        action_search,
        action_selection,
        clothing_file_path,
        clothing_category,
        clothing_search,
        clothing_selection,
        location_file_path,
        location_category,
        location_search,
        location_selection,
        character_file_path,
        character_category,
        character_search,
        character_selection,
        all_slots_enabled=True,
        random_mode="Random Every Queue",
        seed=0,
        delimiter=", ",
        manual_prompt="",
        extra_positive="",
        extra_negative="",
        manual_prompt_input=None,
        subject_file_path=DEFAULT_FILES["subject"],
        subject_category="All",
        subject_search="",
        subject_selection="none",
        slots_json="",
    ):
        local_values = locals()
        slot_values = {
            slot: {
                "file_path": local_values[f"{slot}_file_path"],
                "category": local_values[f"{slot}_category"],
                "search": local_values[f"{slot}_search"],
                "selection": local_values[f"{slot}_selection"],
            }
            for slot in SLOTS
        }
        dynamic_slots = _normalise_dynamic_slots(slots_json)
        if dynamic_slots is not None:
            return _build_dynamic_stack(
                dynamic_slots,
                random_mode,
                seed,
                delimiter,
                manual_prompt,
                extra_positive,
                extra_negative,
                all_slots_enabled,
                manual_prompt_input,
            )

        outputs = _build_stack(
            slot_values,
            random_mode,
            seed,
            delimiter,
            manual_prompt,
            extra_positive,
            extra_negative,
            all_slots_enabled,
            manual_prompt_input,
            slots=SLOTS,
        )
        names_by_slot = dict(zip(OUTPUT_SLOTS, outputs[3:]))
        all_names = "\n".join(
            str(names_by_slot.get(slot, "")).strip()
            for slot in SLOTS
            if not _is_none_name(names_by_slot.get(slot, ""))
            and not _is_random_name(names_by_slot.get(slot, ""))
        )
        return (*outputs[:3], all_names)

def _display_path(path: str) -> str:
    real = os.path.abspath(path)
    root = os.path.abspath(_node_dir())
    try:
        if os.path.commonpath([real, root]) == root:
            return os.path.relpath(real, root).replace("\\", "/")
    except Exception:
        pass
    return real.replace("\\", "/")


def _library_files(force_refresh: bool = False) -> List[str]:
    """Return every packaged CSV/YAML library below the public library roots."""
    global _LIBRARY_FILES_CACHE, _LIBRARY_FILES_CACHE_AT
    now = time.monotonic()
    # Refreshing all dynamic slots issues several near-simultaneous requests.
    # Share the same short-lived scan without making the explicit Refresh button
    # stale for a meaningful amount of time.
    if not force_refresh and _LIBRARY_FILES_CACHE and now - _LIBRARY_FILES_CACHE_AT < 0.25:
        return list(_LIBRARY_FILES_CACHE)
    root = _node_dir()
    paths = []
    for root_name in ("csv", "styles"):
        base = os.path.join(root, root_name)
        if not os.path.isdir(base):
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            # Keep discovery deterministic across Windows/filesystem variants.
            dirnames.sort(key=str.casefold)
            for filename in sorted(filenames, key=str.casefold):
                if filename.lower().endswith((".csv", ".yaml", ".yml")):
                    paths.append(os.path.join(dirpath, filename))
    _LIBRARY_FILES_CACHE = paths
    _LIBRARY_FILES_CACHE_AT = time.monotonic()
    return list(paths)


def _folder_for_file(file_path: str) -> str:
    display = str(file_path or "").replace("\\", "/").strip("/")
    return display.rsplit("/", 1)[0] if "/" in display else ""


def _normalise_folder(value: str) -> str:
    folder = str(value or "").replace("\\", "/").strip().strip("/")
    if not folder or folder.casefold() == ALL_FOLDERS.casefold():
        return ALL_FOLDERS
    return folder


def _slot_folder_candidates(folder_search: str = "", library_files=None) -> List[str]:
    source_files = library_files if library_files is not None else _library_files()
    displays = [_display_path(path) for path in source_files]
    folders = sorted(
        {
            _folder_for_file(path)
            for path in displays
            if _folder_for_file(path)
        },
        key=str.casefold,
    )
    query = str(folder_search or "").strip().casefold()
    if query:
        terms = [term for term in query.split() if term]
        folders = [folder for folder in folders if all(term in folder.casefold() for term in terms)]
    return [ALL_FOLDERS, *folders]


def _slot_file_candidates(slot: str, folder: str = ALL_FOLDERS, library_files=None) -> List[str]:
    slot = str(slot or "medium").strip().lower()
    kind = "characters" if slot == "character" else "styles"
    paths = _candidate_csv_paths(DEFAULT_FILES.get(slot, DEFAULT_CSV), kind=kind)

    # Every Prompt Stack slot can use any packaged CSV/YAML library. Preferred
    # slot-specific files still sort first, but are not the only valid choices.
    paths.extend(library_files if library_files is not None else _library_files())

    seen = set()
    unique = []
    for path in paths:
        real = os.path.abspath(path)
        if not os.path.isfile(real) or real in seen:
            continue
        seen.add(real)
        unique.append(real)

    keyword_map = {
        "pose": ("pose", "/poses/"),
        "action": ("action", "/actions/"),
        "clothing": ("cloth", "fashion", "/clothing/"),
        "location": ("location", "place", "/locations/"),
        "medium": ("style", "/styles/", ".yaml", ".yml"),
        "subject": ("subject", "/subjects/"),
        "character": ("character", "/characters/"),
    }
    keywords = keyword_map.get(slot, ())

    def sort_key(path):
        display = _display_path(path)
        low = display.lower()
        preferred = 0 if any(token in low for token in keywords) else 1
        default_first = 0 if display == DEFAULT_FILES.get(slot) else 1
        return (default_first, preferred, display.lower())

    display_paths = [_display_path(path) for path in sorted(unique, key=sort_key)]
    selected_folder = _normalise_folder(folder)
    if selected_folder != ALL_FOLDERS:
        display_paths = [
            path for path in display_paths
            if _folder_for_file(path).casefold() == selected_folder.casefold()
        ]
    return display_paths


def _slot_file_items(slot: str, folder: str = ALL_FOLDERS, library_files=None) -> List[Dict[str, str]]:
    files = _slot_file_candidates(slot, folder, library_files)
    basename_counts = {}
    for path in files:
        basename = path.replace("\\", "/").rsplit("/", 1)[-1]
        basename_counts[basename.casefold()] = basename_counts.get(basename.casefold(), 0) + 1

    items = []
    for path in files:
        basename = path.replace("\\", "/").rsplit("/", 1)[-1]
        parent = _folder_for_file(path)
        label = basename
        if basename_counts.get(basename.casefold(), 0) > 1:
            label = f"{basename} - {parent}"
        items.append({
            "value": path,
            "label": label,
            "folder": parent,
            "relative_path": path,
        })
    return items


# Live frontend endpoints. They mirror the simple iTools experience: pick a file,
# then the category and style dropdowns repopulate without typing a path.
try:
    from aiohttp import web
    from server import PromptServer

    @PromptServer.instance.routes.get("/nova_prompt_stack/files")
    async def nova_prompt_stack_files(request):
        slot = request.query.get("slot", "medium")
        folder = _normalise_folder(request.query.get("folder", ALL_FOLDERS))
        folder_search = request.query.get("folder_search", "")
        try:
            force_refresh = request.query.get("refresh", "0") == "1"
            library_files = _library_files(force_refresh)
            file_items = _slot_file_items(slot, folder, library_files)
            files = [item["value"] for item in file_items]
            preferred_default = DEFAULT_FILES.get(str(slot).lower(), "")
            default = preferred_default if preferred_default in files else (files[0] if files else "")
            return web.json_response({
                "ok": True,
                "slot": slot,
                "folder": folder,
                "folders": _slot_folder_candidates(folder_search, library_files),
                "folder_search": folder_search,
                "files": files,
                "file_items": file_items,
                "default": default,
                "count": len(files),
            })
        except Exception as error:
            return web.json_response({"ok": False, "error": str(error)}, status=400)

    @PromptServer.instance.routes.get("/nova_prompt_stack/list")
    async def nova_prompt_stack_list(request):
        file_path = request.query.get("file", DEFAULT_CSV)
        slot = request.query.get("slot", "medium")
        category = _restore_menu_value(request.query.get("category", "All")) or "All"
        search = request.query.get("search", "")
        try:
            records = _read_styles(file_path)
            categories = ["All"] + sorted({str(record.get("category", "Uncategorized")) for record in records})
            filtered = _filtered_records(records, category, search)
            return web.json_response({
                "ok": True,
                "slot": slot,
                "styles": [str(record.get("name", "Unnamed")) for record in filtered],
                "categories": categories,
                "count": len(records),
                "filtered_count": len(filtered),
                "resolved_path": _resolve_csv_path(file_path),
            })
        except Exception as error:
            return web.json_response({"ok": False, "error": str(error)}, status=400)
except Exception:
    pass


NODE_CLASS_MAPPINGS = {
    "NovaPromptStackAIO": NovaPromptStackAIOV3,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NovaPromptStackAIO": "NovoLoko Prompt Stack AIO Pro",
}
