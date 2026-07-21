import os
import random
import re
import time
from typing import Dict, List, Tuple

from .nodes import (
    DEFAULT_CSV,
    _candidate_csv_paths,
    _filter_styles,
    _is_no_style_name,
    _node_dir,
    _read_styles,
    _resolve_csv_path,
    _strip_number,
    _trigger_from_name,
    _weighted_choice,
)

SLOTS = ("medium", "pose", "action", "clothing", "location", "character")

DEFAULT_FILES = {
    "medium": "styles/basic.yaml",
    "pose": "csv/poses/novoloko_poses_1000.csv",
    "action": "csv/actions/novoloko_actions_1000.csv",
    "clothing": "csv/clothing/novoloko_branded_clothing_gendered_2400.csv",
    "location": "csv/locations/novoloko_real_locations_1000.csv",
    "character": "csv/characters/novoloko_characters_master_1098.csv",
}

SLOT_LABELS = {
    "medium": "Medium",
    "pose": "Pose",
    "action": "Action",
    "clothing": "Clothing",
    "location": "Location",
    "character": "Character",
}

RANDOM_NAMES = {"random", "random style", "random entry", "random selection"}
NONE_NAMES = {"none", "off", "no style", "no character", "no character/none"}


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


def _filtered_records(records: List[Dict], category: str = "All", search: str = "") -> List[Dict]:
    category = _restore_menu_value(category) or "All"
    search = str(search or "").strip()
    if category == "All" and not search:
        return list(records)
    # Work on shallow copies because the shared helper can mark favorite state.
    return _filter_styles(
        [dict(record) for record in records],
        category,
        search,
        False,
        "",
        saved_favorites=[],
    )


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
        for index, slot in enumerate(SLOTS):
            values = slot_values[slot]
            if str(random_mode) == "Random Every Queue":
                rng = random.Random(time.time_ns() ^ (index * 0x9E3779B97F4A7C15))
            else:
                rng = random.Random(base_seed + index * 1000003)

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

        for slot in reversed(SLOTS):
            current = _apply_template(selected[slot].get("prompt", ""), current, delimiter)
    else:
        for slot in SLOTS:
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
        for slot in SLOTS
    }
    summary_lines = [
        "NovoLoko Prompt Stack AIO Pro",
        f"ALL SLOTS: {'ON' if slots_enabled else 'OFF — selections preserved'}",
        "Order: Medium > Pose > Action > Clothing > Location > Character > Manual Prompt",
    ]
    for slot in SLOTS:
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

    return (
        current,
        combined_negative,
        "\n".join(summary_lines),
        names["medium"],
        names["pose"],
        names["action"],
        names["clothing"],
        names["location"],
        names["character"],
    )


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
        for slot in SLOTS:
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
            _is_random_name(kwargs.get(f"{slot}_selection", "")) for slot in SLOTS
        )
        if any_random and random_mode == "Random Every Queue":
            return time.time_ns()
        mtimes = []
        if all_slots_enabled:
            for slot in SLOTS:
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
            tuple(kwargs.get(f"{slot}_selection", "none") for slot in SLOTS),
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
            for slot in SLOTS
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
        for slot in SLOTS:
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
                {"default": "", "multiline": False},
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
            _is_random_name(kwargs.get(f"{slot}_selection", "")) for slot in SLOTS
        )
        if any_random and random_mode == "Random Every Queue":
            return time.time_ns()
        mtimes = []
        if all_slots_enabled:
            for slot in SLOTS:
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
                for slot in SLOTS
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
            for slot in SLOTS
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
        for slot in SLOTS:
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
                {"default": "", "multiline": False},
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

def _display_path(path: str) -> str:
    real = os.path.abspath(path)
    root = os.path.abspath(_node_dir())
    try:
        if os.path.commonpath([real, root]) == root:
            return os.path.relpath(real, root).replace("\\", "/")
    except Exception:
        pass
    return real.replace("\\", "/")


def _slot_file_candidates(slot: str) -> List[str]:
    slot = str(slot or "medium").strip().lower()
    kind = "characters" if slot == "character" else "styles"
    paths = _candidate_csv_paths(DEFAULT_FILES.get(slot, DEFAULT_CSV), kind=kind)

    # Always include every packaged CSV/YAML file compatible with the slot.
    root = _node_dir()
    for base in (root, os.path.join(root, "csv"), os.path.join(root, "styles")):
        if not os.path.isdir(base):
            continue
        for dirpath, _, filenames in os.walk(base):
            for filename in filenames:
                if filename.lower().endswith((".csv", ".yaml", ".yml")):
                    paths.append(os.path.join(dirpath, filename))

    seen = set()
    unique = []
    for path in paths:
        real = os.path.abspath(path)
        if not os.path.isfile(real) or real in seen:
            continue
        lower = real.lower().replace("\\", "/")
        is_character = "character" in os.path.basename(lower) or "/characters/" in lower
        if slot == "character" and not is_character:
            continue
        if slot != "character" and is_character:
            continue
        seen.add(real)
        unique.append(real)

    keyword_map = {
        "pose": ("pose", "/poses/"),
        "action": ("action", "/actions/"),
        "clothing": ("cloth", "fashion", "/clothing/"),
        "location": ("location", "place", "/locations/"),
        "medium": ("style", "/styles/", ".yaml", ".yml"),
        "character": ("character", "/characters/"),
    }
    keywords = keyword_map.get(slot, ())

    def sort_key(path):
        display = _display_path(path)
        low = display.lower()
        preferred = 0 if any(token in low for token in keywords) else 1
        default_first = 0 if display == DEFAULT_FILES.get(slot) else 1
        return (default_first, preferred, display.lower())

    return [_display_path(path) for path in sorted(unique, key=sort_key)]


# Live frontend endpoints. They mirror the simple iTools experience: pick a file,
# then the category and style dropdowns repopulate without typing a path.
try:
    from aiohttp import web
    from server import PromptServer

    @PromptServer.instance.routes.get("/nova_prompt_stack/files")
    async def nova_prompt_stack_files(request):
        slot = request.query.get("slot", "medium")
        try:
            files = _slot_file_candidates(slot)
            default = DEFAULT_FILES.get(str(slot).lower(), files[0] if files else "")
            return web.json_response({
                "ok": True,
                "slot": slot,
                "files": files,
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
