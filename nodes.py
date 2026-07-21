import csv
import json
import os
import random
import time
from typing import Dict, List

try:
    import yaml
except Exception:
    yaml = None

NOVA_VERSION = "3.2.6"

try:
    import folder_paths
except Exception:
    folder_paths = None

DEFAULT_CSV = "csv/styles/novoloko_krea2_styles_1455.csv"
DEFAULT_CHARACTER_CSV = "csv/characters/novoloko_characters_master_1098.csv"
WEB_DIRECTORY = "./web"

DEFAULT_NEGATIVE = (
    "low quality, worst quality, blurry, soft focus, noisy, jpeg artifacts, watermark, logo, "
    "bad anatomy, deformed, distorted, extra limbs, missing fingers, malformed hands, cropped, out of frame"
)


def _node_dir() -> str:
    return os.path.abspath(os.path.dirname(__file__))


def _comfy_root() -> str:
    here = _node_dir()
    maybe_root = os.path.abspath(os.path.join(here, "..", ".."))
    if os.path.isdir(os.path.join(maybe_root, "custom_nodes")):
        return maybe_root
    return os.getcwd()


def _data_dir() -> str:
    d = os.path.join(_node_dir(), "data")
    os.makedirs(d, exist_ok=True)
    return d


def _resolve_csv_path(csv_file_path: str) -> str:
    """Resolve CSV/YAML style files, legacy names, organized package paths, and absolute paths."""
    value = (csv_file_path or DEFAULT_CSV).strip().strip('"')
    if os.path.isabs(value):
        return value
    root = _comfy_root()
    node = _node_dir()
    candidates = [
        os.path.join(root, value),
        os.path.join(root, "styles", value),
        os.path.join(root, "characters", value),
        os.path.join(root, "input", value),
        os.path.join(node, value),
        os.path.join(node, "csv", value),
        os.path.join(node, "styles", value),
        os.path.join(node, "styles", "more examples", value),
        os.path.join(node, "characters", value),
        os.path.join(root, "custom_nodes", "comfyui-styles_csv_loader", value),
        os.path.join(root, "custom_nodes", "ComfyUI-Styles_CSV_Loader", value),
    ]
    for path in candidates:
        if os.path.exists(path):
            return os.path.abspath(path)

    # Bare filenames can live in any organized package CSV or YAML subfolder.
    if os.path.basename(value) == value:
        for style_root in (os.path.join(node, "csv"), os.path.join(node, "styles")):
            if os.path.isdir(style_root):
                for dirpath, _, filenames in os.walk(style_root):
                    for filename in filenames:
                        if filename.lower() == value.lower():
                            return os.path.abspath(os.path.join(dirpath, filename))
    return os.path.abspath(candidates[0])


def _strip_number(name: str) -> str:
    import re
    return re.sub(r"^\s*\d{3,5}\s*[|\-:]\s*", "", (name or "").strip())


def _is_no_style_name(name: str) -> bool:
    """Treat old saved workflow values such as No Style / 0000 | No Style as a safe empty selection."""
    raw = str(name or "").strip()
    clean = _strip_number(raw).strip().lower().replace("_", " ").replace("-", " ")
    clean = " ".join(clean.split())
    return clean in {
        "no style", "none", "off",
        "no character", "no character/none", "no character none", "no character / none",
    }


def _no_style_record(kind: str = "styles") -> Dict[str, str]:
    is_char = "char" in str(kind or "").lower()
    return {
        "name": "No Character/None" if is_char else "No Style",
        "prompt": "",
        "negative": "",
        "category": "No Character" if is_char else "No Style",
        "weight": 0.0,
        "favorite": False,
        "no_style": True,
    }


def _trigger_from_name(name: str) -> str:
    clean = _strip_number(name)
    # Prefer the leaf after category separators, e.g. "TV Cartoon/The Simpsons Inspired" -> "The Simpsons".
    leaf = clean.split("/")[-1].strip() if "/" in clean else clean
    leaf = leaf.split("|")[-1].strip() if "|" in leaf else leaf
    for suffix in (" Exact", " Inspired", " Literal Trigger", " Trigger", " Style"):
        if leaf.endswith(suffix):
            leaf = leaf[:-len(suffix)].strip()
    # Common search aliases that need the actual franchise/title wording.
    aliases = {
        "Classic Simpsons 90s": "The Simpsons",
        "The Simpsons 1990s Episode": "The Simpsons",
        "Boris Vallejo Julie Bell": "Boris Vallejo and Julie Bell",
        "Studio Ghibli Miyazaki": "Studio Ghibli, Hayao Miyazaki",
    }
    return aliases.get(leaf, leaf)


def _style_trigger_text(style_name: str, mode: str) -> str:
    if not mode or mode == "Off":
        return ""
    clean = _strip_number(style_name)
    trigger = _trigger_from_name(style_name)
    if mode == "Full Numbered Name First":
        return f"Style trigger: {style_name}"
    if mode == "Clean Style Name First":
        return f"Style trigger: {clean}"
    # Strongest and most useful for models like Krea2.
    return f"{trigger}, {trigger} style, visual style reference: {clean}"


def _category_from_name(name: str) -> str:
    clean = _strip_number(name)
    if "|" in clean:
        return clean.split("|", 1)[0].strip()
    if "/" in clean:
        return clean.split("/", 1)[0].strip()
    return "Uncategorized"


def _read_styles(csv_file_path: str) -> List[Dict[str, str]]:
    """Read NovoLoko style records from CSV, YAML, or YML.

    Supported YAML shapes:
      - list of {name, prompt, negative_prompt}
      - {styles: [ ... ]}
      - mapping of style name -> prompt string or style dict
    """
    path = _resolve_csv_path(csv_file_path)
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Style file not found: {path}. Use a full path or place the file in "
            "ComfyUI-NovoLoko/csv or ComfyUI-NovoLoko/styles."
        )

    def normalize_record(row, fallback_name="Unnamed Style"):
        if not isinstance(row, dict):
            return None
        lowered = {str(k).strip().lower(): k for k in row.keys() if k is not None}

        def get_any(*keys, default=""):
            for key in keys:
                original = lowered.get(key)
                if original is not None:
                    value = row.get(original)
                    return "" if value is None else value
            return default

        name = str(get_any("name", "style_name", "style name", "style", "styles", default=fallback_name)).strip()
        prompt = str(get_any("prompt", "positive", "positive_prompt", "positive prompt", default="")).strip()
        negative = str(get_any("negative_prompt", "negative", "negative prompt", default="")).strip()
        if not (name or prompt or negative):
            return None

        category = str(get_any("category", default="")).strip()
        if not category:
            category = _category_from_name(name or fallback_name)

        raw_weight = get_any("weight", default=1.0)
        try:
            weight = max(float(raw_weight), 0.0)
        except Exception:
            weight = 1.0

        raw_fav = str(get_any("favorite", "favourite", "fav", default="")).strip().lower()
        favorite = raw_fav in {"1", "true", "yes", "y", "star", "starred", "favorite", "favourite"}

        return {
            "name": name or fallback_name,
            "prompt": prompt,
            "negative": negative,
            "category": category,
            "weight": weight,
            "favorite": favorite,
        }

    ext = os.path.splitext(path)[1].lower()
    styles = []

    if ext in {".yaml", ".yml"}:
        if yaml is None:
            raise RuntimeError(
                "YAML support requires PyYAML. Run INSTALL_NOVA_VOICE_AND_KOKORO.bat "
                "or install it with: python_embeded\\python.exe -m pip install pyyaml"
            )
        with open(path, "r", encoding="utf-8-sig") as f:
            data = yaml.safe_load(f)

        if data is None:
            rows = []
        elif isinstance(data, list):
            rows = data
        elif isinstance(data, dict) and isinstance(data.get("styles"), list):
            rows = data.get("styles") or []
        elif isinstance(data, dict):
            rows = []
            for key, value in data.items():
                if isinstance(value, str):
                    rows.append({"name": str(key), "prompt": value})
                elif isinstance(value, dict):
                    item = dict(value)
                    item.setdefault("name", str(key))
                    rows.append(item)
        else:
            raise ValueError("YAML style file must contain a list or mapping of styles.")

        for i, row in enumerate(rows, start=1):
            rec = normalize_record(row, fallback_name=f"Unnamed Style {i}")
            if rec is not None:
                styles.append(rec)
    else:
        with open(path, "r", encoding="utf-8-sig", newline="") as f:
            sample = f.read(4096)
            f.seek(0)
            try:
                dialect = csv.Sniffer().sniff(sample) if sample.strip() else csv.excel
            except Exception:
                dialect = csv.excel
            reader = csv.DictReader(f, dialect=dialect)
            if not reader.fieldnames:
                raise ValueError("Styles CSV has no header row. Use: name,prompt,negative_prompt")
            for i, row in enumerate(reader, start=1):
                rec = normalize_record(row, fallback_name=f"Unnamed Style {i}")
                if rec is not None:
                    styles.append(rec)

    if not styles:
        raise ValueError(f"Style file has no usable rows: {path}")
    return styles


def _style_names(csv_file_path=DEFAULT_CSV) -> List[str]:
    rescue = ["No Style", "0000 | No Style"]
    try:
        names = [s["name"] for s in _read_styles(csv_file_path)]
    except Exception:
        names = []

    # Add numbered aliases for unnumbered CSV rows, so old saved workflows like
    # "0001 | Legs Bent On Floor" can still be matched by clean name at runtime.
    aliases = []
    for i, name in enumerate(names, start=1):
        clean = _strip_number(name)
        if clean and not _is_no_style_name(clean):
            alias = f"{i:04d} | {clean}"
            if alias != name:
                aliases.append(alias)

    out = []
    seen = set()
    for value in rescue + names + aliases:
        value = str(value or "").strip()
        if value and value not in seen:
            seen.add(value)
            out.append(value)
    return out or rescue


def _category_names(csv_file_path=DEFAULT_CSV) -> List[str]:
    # Keep broad rescue values here because ComfyUI validates saved COMBO values
    # before the node can read the workflow's csv_file_path. Missing one saved
    # category is enough to stop the whole workflow loading.
    rescue = [
        "All", "No Style", "No Character", "Uncategorized",
        "Prone/Kneeling", "Standing", "Sitting", "Lying", "Floor", "Wall",
        "Chair", "Couch", "Bed", "Glamour", "Fashion", "Portrait",
        "Real Female", "Real Male", "Real Person", "Game Character",
        "Animated Character", "Anime Character", "Comic Character",
        "Movie Character", "TV Character", "Reference Template",
    ]
    try:
        cats = sorted(set(s["category"] for s in _read_styles(csv_file_path)))
    except Exception:
        cats = []
    return _merge_unique_lists(rescue, cats) if "_merge_unique_lists" in globals() else rescue + [c for c in cats if c not in rescue]


def _candidate_csv_paths(csv_file_path=DEFAULT_CSV, kind="styles") -> List[str]:
    """Find nearby CSVs at ComfyUI startup so dropdowns include values saved by old workflows.

    This deliberately avoids a full recursive scan of the whole ComfyUI tree.
    """
    root = _comfy_root()
    node = _node_dir()
    bases = [
        root,
        os.path.join(root, "styles"),
        os.path.join(root, "characters"),
        os.path.join(root, "input"),
        node,
        os.path.join(node, "styles"),
        os.path.join(node, "styles", "more examples"),
        os.path.join(node, "characters"),
        os.path.join(root, "custom_nodes", "comfyui-styles_csv_loader"),
        os.path.join(root, "custom_nodes", "ComfyUI-Styles_CSV_Loader"),
    ]
    paths = []
    for value in [csv_file_path, DEFAULT_CSV, DEFAULT_CHARACTER_CSV]:
        try:
            resolved = _resolve_csv_path(value)
            if resolved:
                paths.append(resolved)
        except Exception:
            pass
    for base in bases:
        if not os.path.isdir(base):
            continue
        try:
            for fn in os.listdir(base):
                full = os.path.join(base, fn)
                if os.path.isfile(full) and fn.lower().endswith((".csv", ".yaml", ".yml")):
                    paths.append(full)
        except Exception:
            pass
    organized_csv_root = os.path.join(node, "csv")
    if os.path.isdir(organized_csv_root):
        try:
            for dirpath, _, filenames in os.walk(organized_csv_root):
                for fn in filenames:
                    if fn.lower().endswith((".csv", ".yaml", ".yml")):
                        paths.append(os.path.join(dirpath, fn))
        except Exception:
            pass
    organized_style_root = os.path.join(node, "styles")
    if os.path.isdir(organized_style_root):
        try:
            for dirpath, _, filenames in os.walk(organized_style_root):
                for fn in filenames:
                    if fn.lower().endswith((".csv", ".yaml", ".yml")):
                        paths.append(os.path.join(dirpath, fn))
        except Exception:
            pass
    out = []
    seen = set()
    want_chars = "char" in str(kind or "").lower()
    for path in paths:
        try:
            real = os.path.abspath(path)
            if not os.path.exists(real) or real in seen:
                continue
            base = os.path.basename(real).lower()
            if want_chars:
                # Character dropdowns should prioritize character CSVs, but keep explicit csv_file_path.
                if real != os.path.abspath(_resolve_csv_path(csv_file_path)) and "character" not in base and "characters" not in base:
                    continue
            else:
                # Style dropdowns should not be polluted by huge character lists unless explicitly selected.
                if real != os.path.abspath(_resolve_csv_path(csv_file_path)) and ("character" in base or "characters" in base):
                    continue
            seen.add(real)
            out.append(real)
        except Exception:
            continue
    return out


def _dropdown_style_names(csv_file_path=DEFAULT_CSV, kind="styles") -> List[str]:
    rescue = ["No Character/None", "0000 | No Character/None"] if "char" in str(kind or "").lower() else ["No Style", "0000 | No Style"]
    out = list(rescue)
    for path in _candidate_csv_paths(csv_file_path, kind=kind):
        out = _merge_unique_lists(out, _style_names(path))
    return out or rescue


def _dropdown_category_names(csv_file_path=DEFAULT_CSV, kind="styles") -> List[str]:
    out = _category_names(csv_file_path)
    for path in _candidate_csv_paths(csv_file_path, kind=kind):
        out = _merge_unique_lists(out, _category_names(path))
    return out or ["All"]


def _merge_unique_lists(*lists):
    seen = set()
    out = []
    for values in lists:
        for value in values or []:
            if value not in seen:
                seen.add(value)
                out.append(value)
    return out


def _character_names_for_dropdown(default_csv=DEFAULT_CHARACTER_CSV) -> List[str]:
    """Return names from the single current NovoLoko character library."""
    names = ["No Character/None", "0000 | No Character/None", "No Style", "0000 | No Style"]
    return _merge_unique_lists(names, _style_names(default_csv), _style_names(DEFAULT_CHARACTER_CSV))


def _character_categories_for_dropdown(default_csv=DEFAULT_CHARACTER_CSV) -> List[str]:
    """Return broad rescue categories plus categories in the current character library."""
    broad = [
        "All", "Real Female", "Real Male", "Real Person",
        "Game Character", "Animated Character", "Anime Character", "Comic Character",
        "Movie Character", "TV Character", "Reference Template", "No Character",
    ]
    return _merge_unique_lists(broad, _category_names(default_csv), _category_names(DEFAULT_CHARACTER_CSV))


def _load_json(name: str, default):
    path = os.path.join(_data_dir(), name)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def _save_json(name: str, value) -> None:
    path = os.path.join(_data_dir(), name)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(value, f, indent=2, ensure_ascii=False)
    except Exception:
        pass


def _split_lines(text: str) -> List[str]:
    return [x.strip() for x in (text or "").replace(";", "\n").splitlines() if x.strip()]


def _favorite_filename(kind: str) -> str:
    kind = str(kind or "styles").strip().lower()
    if "char" in kind:
        return "favorites_characters.json"
    return "favorites_styles.json"


def _load_favorites(kind: str) -> List[str]:
    data = _load_json(_favorite_filename(kind), [])
    if isinstance(data, dict):
        data = data.get("favorites", [])
    if not isinstance(data, list):
        return []
    out = []
    seen = set()
    for item in data:
        name = str(item or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        out.append(name)
    return out


def _save_favorites(kind: str, favorites: List[str]) -> None:
    out = []
    seen = set()
    for item in favorites or []:
        name = str(item or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        out.append(name)
    _save_json(_favorite_filename(kind), out)


def _favorite_match_set(names) -> tuple:
    favs = set(str(x or "").strip() for x in (names or []) if str(x or "").strip())
    favs_clean = {_strip_number(x).lower() for x in favs}
    return favs, favs_clean


def _mark_favorites(styles, favorite_names):
    favs, favs_clean = _favorite_match_set(favorite_names)
    if not favs and not favs_clean:
        return styles
    for s in styles:
        if s["name"] in favs or _strip_number(s["name"]).lower() in favs_clean:
            s["favorite"] = True
    return styles


def _filter_styles(styles, category, search, favorites_only, favorites_text, saved_favorites=None):
    favs = list(_split_lines(favorites_text)) + list(saved_favorites or [])
    _mark_favorites(styles, favs)
    out = []
    q = (search or "").strip().lower()
    for s in styles:
        cat = s.get("category", "")
        # Broad-category support: "Real Female" should match "Real Female/Actor".
        if category and category != "All":
            if cat != category and not cat.startswith(str(category).rstrip("/") + "/"):
                continue
        if q and q not in s["name"].lower() and q not in s["prompt"].lower() and q not in cat.lower():
            continue
        if favorites_only and not s.get("favorite"):
            continue
        out.append(s)
    return out if favorites_only else (out or styles)


def _weighted_choice(rng, styles):
    weights = [max(float(s.get("weight", 1.0)), 0.0) for s in styles]
    if sum(weights) <= 0:
        return rng.choice(styles)
    return rng.choices(styles, weights=weights, k=1)[0]


class LoadStylesCSVPro:
    @classmethod
    def INPUT_TYPES(cls):
        default_csv = DEFAULT_CSV if os.path.exists(_resolve_csv_path(DEFAULT_CSV)) else "styles.csv"
        return {
            "required": {
                "csv_file_path": ("STRING", {"default": default_csv, "multiline": False}),
                "mode": (["Manual", "Random Every Queue", "Random From Seed", "Favorites Only", "Category Random", "Search Random", "Search First Match"], {"default": "Manual"}),
                # Validation-safe STRING; frontend converts it to a live CSV/YAML dropdown.
                "style": ("STRING", {"default": "No Style", "multiline": False}),
                # Keep v5 widget order for old workflow compatibility.
                # New v6/v7 controls are appended after refresh_id so saved workflows do not shift values.
                "manual_style_name": ("STRING", {"default": "", "multiline": False}),
                # Validation-safe STRING; frontend converts it to a live category dropdown.
                "category": ("STRING", {"default": "All", "multiline": False}),
                "search": ("STRING", {"default": "", "multiline": False}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF}),
                # RESCUE: use STRING for saved-workflow tolerance. Some older workflows saved delimiter text in random_count.
                "use_weighted_random": ("STRING", {"default": "true", "multiline": False}),
                "random_count": ("STRING", {"default": "1", "multiline": False}),
                "delimiter": ("STRING", {"default": ", ", "multiline": False}),
                "extra_positive": ("STRING", {"default": "", "multiline": True}),
                "extra_negative": ("STRING", {"default": "", "multiline": True}),
                "favorites_list": ("STRING", {"default": "", "multiline": True}),
                "save_to_history": ("BOOLEAN", {"default": True}),
                "refresh_id": ("INT", {"default": 0, "min": 0, "max": 999999999}),
                # v8: dropdown restored, but includes old corrupted values so saved workflows do not fail validation.
                "style_name_trigger": (["Exact Search Trigger First", "Clean Style Name First", "Full Numbered Name First", "Off", "true", "false"], {"default": "Exact Search Trigger First"}),
                "search_overrides_manual": ("BOOLEAN", {"default": True}),
                "history_display_count": ("INT", {"default": 40, "min": 0, "max": 200}),
                "overlay_enabled": ("BOOLEAN", {"default": True}),
                # v8: dropdown restored. "STYLE: " is included only to rescue workflows saved during the bad widget-order build.
                "overlay_format": (["Number + Style", "Style Only", "Clean Style Name", "Trigger Only", "Style + Mode", "Style + Index", "Full Debug", "STYLE: "], {"default": "Number + Style"}),
                "overlay_prefix": ("STRING", {"default": "STYLE: ", "multiline": False}),
                "overlay_max_chars": ("INT", {"default": 140, "min": 20, "max": 500}),
                "selected_output_format": (["Clean Style Name", "Full Numbered Name", "Trigger Only"], {"default": "Clean Style Name"}),
                # v0.9 favorites: stored locally in custom_nodes/ComfyUI-NovoLoko/data/.
                "use_saved_favorites": ("BOOLEAN", {"default": True}),
                "favorite_action": (["None", "Add Selected To Favorites", "Remove Selected From Favorites", "Clear All Favorites"], {"default": "None"}),
                "favorites_display_count": ("INT", {"default": 30, "min": 0, "max": 300}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING", "INT", "STRING")
    RETURN_NAMES = ("positive prompt", "negative prompt", "selected style", "info", "selected index", "overlay text")
    FUNCTION = "load_style"
    CATEGORY = "NovoLoko/Style"

    @classmethod
    def IS_CHANGED(cls, csv_file_path, mode, style, manual_style_name, category, search, seed,
                   use_weighted_random, random_count, delimiter, extra_positive, extra_negative, favorites_list,
                   save_to_history, refresh_id=0, style_name_trigger="Exact Search Trigger First",
                   search_overrides_manual=True, history_display_count=40,
                   overlay_enabled=True, overlay_format="Number + Style", overlay_prefix="STYLE: ", overlay_max_chars=140, selected_output_format="Clean Style Name",
                   use_saved_favorites=True, favorite_action="None", favorites_display_count=30):
        # Random Every Queue should always run again. Other modes re-run when widgets/files change.
        if mode == "Random Every Queue":
            return time.time_ns()
        try:
            path = _resolve_csv_path(csv_file_path)
            mtime = os.path.getmtime(path) if os.path.exists(path) else 0
        except Exception:
            mtime = 0
        return (csv_file_path, mode, style, manual_style_name, category, search, seed,
                use_weighted_random, random_count, delimiter, extra_positive, extra_negative, favorites_list,
                save_to_history, refresh_id, style_name_trigger, search_overrides_manual, history_display_count, overlay_enabled,
                overlay_format, overlay_prefix, overlay_max_chars, selected_output_format,
                use_saved_favorites, favorite_action, favorites_display_count, tuple(_load_favorites(cls._favorite_kind() if hasattr(cls, "_favorite_kind") else "styles")), mtime)

    @classmethod
    def _favorite_kind(cls):
        return "styles"

    def _match_style(self, styles, name):
        name = (name or "").strip()
        if not name:
            return None
        # Exact first.
        found = next((s for s in styles if s["name"] == name), None)
        if found is not None:
            return found
        # Clean numbered-name exact.
        clean = _strip_number(name).lower()
        found = next((s for s in styles if _strip_number(s["name"]).lower() == clean), None)
        if found is not None:
            return found
        # Fuzzy name contains.
        lower = name.lower()
        found = next((s for s in styles if lower in s["name"].lower()), None)
        if found is not None:
            return found
        # Trigger alias / prompt contains.
        found = next((s for s in styles if lower in _trigger_from_name(s["name"]).lower() or lower in s.get("prompt", "").lower()), None)
        return found

    def _make_overlay_text(self, picked, mode, first_index, total, csv_file_path, overlay_enabled, overlay_format, overlay_prefix, overlay_max_chars):
        if not overlay_enabled or all(s.get("no_style") for s in (picked or [])):
            return ""
        selected_names = " + ".join(s["name"] for s in picked)
        clean_names = " + ".join(_strip_number(s["name"]) for s in picked)
        trigger_names = " + ".join(_trigger_from_name(s["name"]) for s in picked)
        prefix = overlay_prefix or ""
        # v0.6: "Style Only" now means the clean CSV name, e.g. "Photo/Golden Hour".
        # The previous behavior (leaf trigger only, e.g. "Golden Hour") is kept as "Trigger Only".
        if overlay_format in {"Style Only", "Clean Style Name"}:
            text = f"{prefix}{clean_names}"
        elif overlay_format == "Trigger Only":
            text = f"{prefix}{trigger_names}"
        elif overlay_format == "Number + Style":
            text = f"{prefix}{selected_names}"
        elif overlay_format == "Style + Mode":
            text = f"{prefix}{clean_names} | {mode}"
        elif overlay_format == "Style + Index":
            text = f"{prefix}{clean_names} | {first_index + 1}/{total}"
        else:
            text = f"{prefix}{clean_names} | {mode} | {os.path.basename(_resolve_csv_path(csv_file_path))}"
        try:
            max_chars = int(overlay_max_chars)
        except Exception:
            max_chars = 140
        if max_chars > 0 and len(text) > max_chars:
            text = text[:max(0, max_chars - 1)].rstrip() + "…"
        return text

    def load_style(self, csv_file_path, mode, style, manual_style_name, category, search, seed,
                   use_weighted_random, random_count, delimiter, extra_positive, extra_negative, favorites_list,
                   save_to_history, refresh_id=0, style_name_trigger="Exact Search Trigger First",
                   search_overrides_manual=True, history_display_count=40,
                   overlay_enabled=True, overlay_format="Number + Style", overlay_prefix="STYLE: ", overlay_max_chars=140, selected_output_format="Clean Style Name",
                   use_saved_favorites=True, favorite_action="None", favorites_display_count=30):
        # Defensive defaults in case an old/corrupted workflow passes shifted values.
        if isinstance(style_name_trigger, bool):
            style_name_trigger = "Exact Search Trigger First" if style_name_trigger else "Off"
        elif str(style_name_trigger).strip().lower() in {"true", "1", "yes", "on"}:
            style_name_trigger = "Exact Search Trigger First"
        elif str(style_name_trigger).strip().lower() in {"false", "0", "no", "off"}:
            style_name_trigger = "Off"
        elif style_name_trigger not in {"Off", "Exact Search Trigger First", "Clean Style Name First", "Full Numbered Name First"}:
            style_name_trigger = "Exact Search Trigger First"
        try:
            random_count = int(random_count)
        except Exception:
            random_count = 1
        try:
            history_display_count = int(history_display_count)
        except Exception:
            history_display_count = 40
        # RESCUE: tolerate old/corrupted workflow strings/booleans.
        if isinstance(use_weighted_random, str):
            use_weighted_random = use_weighted_random.strip().lower() in {"1", "true", "yes", "y", "on", "randomize", "weighted"}
        else:
            use_weighted_random = bool(use_weighted_random)
        if isinstance(search_overrides_manual, str):
            search_overrides_manual = search_overrides_manual.strip().lower() in {"1", "true", "yes", "y", "on"}
        else:
            search_overrides_manual = bool(search_overrides_manual)
        if isinstance(overlay_enabled, str):
            overlay_enabled = overlay_enabled.strip().lower() in {"1", "true", "yes", "y", "on"}
        else:
            overlay_enabled = bool(overlay_enabled)
        try:
            overlay_max_chars = int(overlay_max_chars)
        except Exception:
            overlay_max_chars = 140
        if isinstance(use_saved_favorites, str):
            use_saved_favorites = use_saved_favorites.strip().lower() in {"1", "true", "yes", "y", "on"}
        else:
            use_saved_favorites = bool(use_saved_favorites)
        try:
            favorites_display_count = int(favorites_display_count)
        except Exception:
            favorites_display_count = 30
        favorite_action = str(favorite_action or "None").strip()
        valid_overlay_formats = {"Style Only", "Clean Style Name", "Trigger Only", "Number + Style", "Style + Mode", "Style + Index", "Full Debug"}
        # If a corrupted workflow shifted overlay_prefix into overlay_format, keep it as prefix and restore format.
        if overlay_format not in valid_overlay_formats:
            if isinstance(overlay_format, str) and overlay_format.strip():
                overlay_prefix = overlay_format
            overlay_format = "Number + Style"
        styles = _read_styles(csv_file_path)
        fav_kind = self._favorite_kind()
        saved_favorites = _load_favorites(fav_kind) if use_saved_favorites else []

        # Manual no-style rescue. This prevents old workflows saved with "No Style"
        # from falling through to the first real CSV style.
        manual_no_style_requested = (
            mode == "Manual"
            and not str(manual_style_name or "").strip()
            and _is_no_style_name(style)
        ) or (mode == "Manual" and _is_no_style_name(manual_style_name))

        # Universal filtered pool. Search now affects actual node output, not just the dropdown.
        filtered_pool = _filter_styles(styles, category, search, mode == "Favorites Only", favorites_list, saved_favorites=saved_favorites)
        pool = filtered_pool
        q = (search or "").strip()

        if mode == "Manual":
            selected = None
            if manual_no_style_requested:
                selected = _no_style_record(fav_kind)
            else:
                # Manual typed name is strongest.
                if (manual_style_name or "").strip():
                    selected = self._match_style(styles, manual_style_name)
                # If search override is enabled and search has results, prefer the currently selected value only if it is inside the search pool.
                if selected is None and search_overrides_manual and q:
                    dropdown_choice = self._match_style(styles, style)
                    if dropdown_choice and any(s["name"] == dropdown_choice["name"] for s in filtered_pool):
                        selected = dropdown_choice
                    else:
                        selected = filtered_pool[0] if filtered_pool else None
                # Normal manual style value.
                if selected is None:
                    selected = self._match_style(styles, style)
                if selected is None:
                    selected = styles[0]
            picked = [selected]
        elif mode == "Search First Match":
            picked = [filtered_pool[0] if filtered_pool else styles[0]]
        else:
            if mode == "Random Every Queue":
                rng = random.Random(time.time_ns() ^ random.getrandbits(64) ^ int(refresh_id or 0))
            else:
                rng = random.Random(int(seed) ^ int(refresh_id or 0))

            # All random modes now respect both category and search unless intentionally empty.
            if mode == "Category Random":
                pool = _filter_styles(styles, category, search, False, favorites_list, saved_favorites=saved_favorites)
            elif mode == "Search Random":
                pool = _filter_styles(styles, category, search, False, favorites_list, saved_favorites=saved_favorites)
            elif mode == "Favorites Only":
                pool = _filter_styles(styles, category, search, True, favorites_list, saved_favorites=saved_favorites)
            else:
                pool = filtered_pool

            picked = []
            work = list(pool)
            for _ in range(max(1, int(random_count))):
                if not work:
                    break
                choice = _weighted_choice(rng, work) if use_weighted_random else rng.choice(work)
                picked.append(choice)
                work.remove(choice)
            if not picked:
                picked = [styles[0]]

        # v0.9: saved favorites. This works without frontend JS: choose an action, queue once,
        # then set action back to None. Favorites are stored in data/favorites_styles.json or
        # data/favorites_characters.json inside this custom-node folder.
        favorite_message = ""
        if favorite_action == "Add Selected To Favorites":
            current = _load_favorites(fav_kind)
            current = _merge_unique_lists(current, [s["name"] for s in picked])
            _save_favorites(fav_kind, current)
            saved_favorites = current
            _mark_favorites(styles, saved_favorites)
            favorite_message = f"Added to {fav_kind} favorites: " + " + ".join(s["name"] for s in picked)
        elif favorite_action == "Remove Selected From Favorites":
            current = _load_favorites(fav_kind)
            remove_full = {s["name"] for s in picked}
            remove_clean = {_strip_number(s["name"]).lower() for s in picked}
            current = [x for x in current if x not in remove_full and _strip_number(x).lower() not in remove_clean]
            _save_favorites(fav_kind, current)
            saved_favorites = current
            for s in styles:
                s["favorite"] = False
            _mark_favorites(styles, saved_favorites + _split_lines(favorites_list))
            favorite_message = f"Removed from {fav_kind} favorites: " + " + ".join(s["name"] for s in picked)
        elif favorite_action == "Clear All Favorites":
            _save_favorites(fav_kind, [])
            saved_favorites = []
            for s in styles:
                s["favorite"] = False
            _mark_favorites(styles, _split_lines(favorites_list))
            favorite_message = f"Cleared all saved {fav_kind} favorites"

        positives = []
        for st in picked:
            trig = _style_trigger_text(st.get("name", ""), style_name_trigger)
            if trig and not st.get("no_style") and _strip_number(st.get("name", "")).lower() not in {"no style", "no character", "no character/none"}:
                positives.append(trig)
            if st.get("prompt"):
                positives.append(st["prompt"])
        negatives = [s["negative"] for s in picked if s.get("negative")]
        if extra_positive.strip():
            positives.append(extra_positive.strip())
        if extra_negative.strip():
            negatives.append(extra_negative.strip())
        positive = (delimiter or ", ").join(positives)
        negative = (delimiter or ", ").join(negatives)

        selected_names = " + ".join(s["name"] for s in picked)
        clean_selected_names = " + ".join(_strip_number(s["name"]) for s in picked)
        trigger_selected_names = " + ".join(_trigger_from_name(s["name"]) for s in picked)
        selected_output_format = str(selected_output_format or "Clean Style Name").strip()
        if selected_output_format == "Full Numbered Name":
            selected_output = selected_names
        elif selected_output_format == "Trigger Only":
            selected_output = trigger_selected_names
        else:
            selected_output = clean_selected_names
        first_index = next((i for i, s in enumerate(styles) if s["name"] == picked[0]["name"]), 0)
        display_count = max(0, min(int(history_display_count or 0), 200))
        overlay_text = self._make_overlay_text(picked, mode, first_index, len(styles), csv_file_path,
                                               overlay_enabled, overlay_format, overlay_prefix, overlay_max_chars)

        info = (
            f"CSV: {os.path.basename(_resolve_csv_path(csv_file_path))}\n"
            f"Mode: {mode}\n"
            f"Selected: {selected_names}\n"
            f"Category: {' + '.join(sorted(set(s['category'] for s in picked)))}\n"
            f"Index: {first_index + 1} / {len(styles)}\n"
            f"Pool: {len(pool)} styles\n"
            f"Search: {q or '(empty)'}\n"
            f"Search overrides manual: {search_overrides_manual}\n"
            f"Weighted: {use_weighted_random}\n"
            f"Style name trigger: {style_name_trigger}\n"
            f"Overlay: {overlay_text}\n"
            f"Refresh ID: {refresh_id}\n"
            f"Saved favorites: {len(saved_favorites)} {fav_kind} / use saved: {use_saved_favorites}\n"
            f"Favorite action: {favorite_action if favorite_action else 'None'}{(' / ' + favorite_message) if favorite_message else ''}\n"
        )
        if int(favorites_display_count or 0) > 0 and saved_favorites:
            shown_favs = saved_favorites[:max(0, min(int(favorites_display_count or 0), 300))]
            info += "\nSaved favorites shown ({}/{}):\n".format(len(shown_favs), len(saved_favorites)) + "\n".join([f"★ {x}" for x in shown_favs]) + "\n"

        if save_to_history:
            hist = _load_json("history.json", [])
            entry = {"time": int(time.time()), "selected": selected_names, "mode": mode, "csv": _resolve_csv_path(csv_file_path), "overlay": overlay_text}
            # Keep a longer history on disk. Display count is controlled by the widget.
            hist = [entry] + hist[:199]
            _save_json("history.json", hist)
            if display_count > 0:
                info += f"\nLast styles ({min(display_count, len(hist))}/{len(hist)}):\n" + "\n".join([f"- {h.get('selected','')}" for h in hist[:display_count]])

        return {"ui": {"text": [info, overlay_text]}, "result": (positive, negative, selected_output, info, int(first_index), overlay_text)}

class NovaPromptStyleSwitchV3:
    """Final prompt builder for manual/enhanced prompt + CSV style.

    Style text is never sent to the enhancer. It is only attached at the final
    CLIP prompt stage, which keeps the enhancer from rewriting/muddying it.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "style_prompt": ("STRING", {"forceInput": True}),
                "manual_prompt": ("STRING", {"forceInput": True}),
                "enhanced_prompt": ("STRING", {"forceInput": True}),
                "use_enhancer": ("BOOLEAN", {"default": True}),
                "include_style": ("BOOLEAN", {"default": True}),
                "style_position": (["before_prompt", "after_prompt"], {"default": "before_prompt"}),
                "style_prefix": ("STRING", {"default": "Visual style / art direction: "}),
                "delimiter": ("STRING", {"default": ", "}),
                # RESCUE: STRING prevents combo validation errors from older workflows; supported: normal, strong, very_strong, nova_overkill.
                "style_strength": ("STRING", {"default": "nova_overkill", "multiline": False}),
            },
            "optional": {
                "extra_positive": ("STRING", {"multiline": True, "default": ""}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("final_prompt", "debug_status")
    FUNCTION = "build_prompt"
    CATEGORY = "NovoLoko/Prompt"

    @staticmethod
    def _clean(value):
        return "" if value is None else str(value).strip()

    def _style_block(self, style, prefix, strength):
        if not style:
            return ""
        prefix = self._clean(prefix)
        if prefix and not prefix.endswith(" "):
            prefix += " "
        block = f"{prefix}{style}" if prefix else style
        strength = str(strength or "very_strong").strip().lower()
        if strength == "strong":
            return f"{block}. Apply this visual style consistently across the entire image."
        if strength == "very_strong":
            return f"{block}. Strong style override. Apply this visual style consistently across the entire image, including lighting, color palette, rendering medium, texture, composition, and finish."
        if strength == "nova_overkill":
            return f"{block}. HARD STYLE LOCK: prioritize this exact visual style over generic realism. Carry the look through character design, outlines, anatomy language, lighting, color palette, background rendering, texture, composition, and final finish."
        return block

    def build_prompt(self, style_prompt, manual_prompt, enhanced_prompt,
                     use_enhancer=True, include_style=True,
                     style_position="before_prompt", style_prefix="Visual style / art direction: ",
                     delimiter=", ", style_strength="very_strong", extra_positive=""):
        style = self._clean(style_prompt)
        manual = self._clean(manual_prompt)
        enhanced = self._clean(enhanced_prompt)
        extra = self._clean(extra_positive)
        delim = delimiter if delimiter is not None else ", "
        base = enhanced if use_enhancer else manual
        style_block = self._style_block(style, style_prefix, style_strength) if include_style else ""
        parts = []
        if style_block and style_position == "before_prompt": parts.append(style_block)
        if base: parts.append(base)
        if style_block and style_position == "after_prompt": parts.append(style_block)
        if extra: parts.append(extra)
        final = delim.join([p for p in parts if p])
        status = [
            "NovoLoko Prompt Style Switch",
            f"Mode: {'ENHANCER ON' if use_enhancer else 'MANUAL / ENHANCER BYPASSED'}",
            f"Style included: {'yes' if include_style and bool(style) else 'no'}",
            f"Style position in FINAL CLIP prompt: {style_position}",
            f"Style strength: {style_strength}",
        ]
        status.append(f"Style text received: {style[:500]}{'...' if len(style) > 500 else ''}" if style else "Style text received: EMPTY")
        status.append(f"Base prompt received: {base[:500]}{'...' if len(base) > 500 else ''}" if base else "Base prompt received: EMPTY")
        status.append(f"Final prompt starts with: {final[:700]}{'...' if len(final) > 700 else ''}")
        return (final, "\n".join(status))


STYLE_PREFIX_OPTIONS = [
    "Visual style / art direction:",
    "Style:",
    "Render style:",
    "Art style:",
    "HARD STYLE LOCK:",
    "Exact visual reference:",
    "Apply this look:",
    "None",
    "Custom",
]
CHARACTER_PREFIX_OPTIONS = [
    "Character reference:",
    "Main character:",
    "Subject identity:",
    "Exact character trigger:",
    "Recognizable character:",
    "None",
    "Custom",
]
STRENGTH_OPTIONS = ["off", "subtle", "normal", "strong", "very_strong", "nova_overkill", "literal_trigger_lock"]


def _prefix_value(choice, custom=""):
    choice = str(choice or "").strip()
    if choice == "Custom":
        return str(custom or "").strip()
    if choice == "None":
        return ""
    return choice


class NovaPromptStyleCharacterSwitchV4(NovaPromptStyleSwitchV3):
    """Final prompt builder for enhancer + style CSV + character CSV."""
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "style_prompt": ("STRING", {"forceInput": True}),
                "character_prompt": ("STRING", {"forceInput": True}),
                "manual_prompt": ("STRING", {"forceInput": True}),
                "enhanced_prompt": ("STRING", {"forceInput": True}),
                "use_enhancer": ("BOOLEAN", {"default": True}),
                "include_style": ("BOOLEAN", {"default": True}),
                "include_character": ("BOOLEAN", {"default": True}),
                "prompt_order": ([
                    "style_character_prompt",
                    "character_style_prompt",
                    "prompt_character_style",
                    "prompt_style_character",
                    "character_prompt_style",
                    "style_prompt_character",
                ], {"default": "style_character_prompt"}),
                "style_prefix": (STYLE_PREFIX_OPTIONS, {"default": "Visual style / art direction:"}),
                "character_prefix": (CHARACTER_PREFIX_OPTIONS, {"default": "Character reference:"}),
                "style_strength": (STRENGTH_OPTIONS, {"default": "nova_overkill"}),
                "character_strength": (STRENGTH_OPTIONS, {"default": "literal_trigger_lock"}),
                "delimiter": ("STRING", {"default": ", "}),
            },
            "optional": {
                "custom_style_prefix": ("STRING", {"default": "", "multiline": False}),
                "custom_character_prefix": ("STRING", {"default": "", "multiline": False}),
                "extra_positive": ("STRING", {"multiline": True, "default": ""}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "BOOLEAN")
    RETURN_NAMES = ("final_prompt", "debug_status", "overlay_text", "overlay_enabled")
    FUNCTION = "build_prompt"
    CATEGORY = "NovoLoko/Prompt"

    def _block(self, text, prefix_choice, custom_prefix, strength, kind="style"):
        text = self._clean(text)
        if not text:
            return ""
        strength = str(strength or "normal").strip().lower()
        if strength == "off":
            return ""
        prefix = _prefix_value(prefix_choice, custom_prefix)
        if prefix and not prefix.endswith(" "):
            prefix += " "
        block = f"{prefix}{text}" if prefix else text
        if strength == "subtle":
            return block
        if kind == "character":
            if strength == "strong":
                return f"{block}. Keep the character recognizable with accurate signature features, outfit, colors, silhouette, and identity cues."
            if strength == "very_strong":
                return f"{block}. Strong character lock: preserve recognizable face/shape language, signature outfit, color palette, silhouette, props, and role identity across the whole image."
            if strength == "nova_overkill":
                return f"{block}. HARD CHARACTER LOCK: prioritize this exact character identity over generic subject details. Preserve signature face, silhouette, costume, colors, accessories, proportions, and iconic visual cues."
            if strength == "literal_trigger_lock":
                return f"{block}. LITERAL CHARACTER TRIGGER LOCK: use the named character/person trigger directly and make the subject instantly recognizable while keeping the scene and style consistent."
            return f"{block}. Keep the character recognizable."
        else:
            if strength == "strong":
                return f"{block}. Apply this visual style consistently across the entire image."
            if strength == "very_strong":
                return f"{block}. Strong style override. Apply this visual style consistently across lighting, palette, rendering medium, texture, composition, and finish."
            if strength == "nova_overkill":
                return f"{block}. HARD STYLE LOCK: prioritize this exact visual style over generic realism. Carry the look through character design, outlines, anatomy language, lighting, color palette, background rendering, texture, composition, and final finish."
            if strength == "literal_trigger_lock":
                return f"{block}. LITERAL STYLE TRIGGER LOCK: use the named style/franchise/artist trigger directly and make the final image clearly match that visual language."
            return block

    def build_prompt(self, style_prompt, character_prompt, manual_prompt, enhanced_prompt,
                     use_enhancer=True, include_style=True, include_character=True,
                     prompt_order="style_character_prompt",
                     style_prefix="Visual style / art direction:", character_prefix="Character reference:",
                     style_strength="nova_overkill", character_strength="literal_trigger_lock", delimiter=", ",
                     custom_style_prefix="", custom_character_prefix="", extra_positive=""):
        style = self._clean(style_prompt)
        character = self._clean(character_prompt)
        manual = self._clean(manual_prompt)
        enhanced = self._clean(enhanced_prompt)
        base = enhanced if use_enhancer else manual
        style_block = self._block(style, style_prefix, custom_style_prefix, style_strength, kind="style") if include_style else ""
        character_block = self._block(character, character_prefix, custom_character_prefix, character_strength, kind="character") if include_character else ""
        prompt_block = base
        extra = self._clean(extra_positive)
        order_map = {
            "style_character_prompt": [style_block, character_block, prompt_block],
            "character_style_prompt": [character_block, style_block, prompt_block],
            "prompt_character_style": [prompt_block, character_block, style_block],
            "prompt_style_character": [prompt_block, style_block, character_block],
            "character_prompt_style": [character_block, prompt_block, style_block],
            "style_prompt_character": [style_block, prompt_block, character_block],
        }
        parts = order_map.get(prompt_order, order_map["style_character_prompt"])
        if extra:
            parts.append(extra)
        delim = delimiter if delimiter is not None else ", "
        final = delim.join([p for p in parts if p])
        overlay = ""
        overlay_character_active = bool(include_character and character and character_block)
        overlay_style_active = bool(include_style and style and style_block)
        if overlay_character_active:
            overlay += "CHAR: " + character.split(",")[0][:120]
        if overlay_style_active:
            overlay += (" | " if overlay else "") + "STYLE: " + style.split(",")[0][:120]
        overlay_enabled = bool(overlay.strip())
        status = [
            "NovoLoko Prompt Style + Character Switch v4 / v5 overlay auto-enable",
            f"Mode: {'ENHANCER ON' if use_enhancer else 'MANUAL / ENHANCER BYPASSED'}",
            f"Prompt order: {prompt_order}",
            f"Style included: {'yes' if include_style and bool(style) else 'no'} / strength: {style_strength} / prefix: {style_prefix}",
            f"Character included: {'yes' if include_character and bool(character) else 'no'} / strength: {character_strength} / prefix: {character_prefix}",
            f"Overlay enabled output: {overlay_enabled} / overlay text: {overlay if overlay else 'EMPTY'}",
            f"Style received: {style[:350]}{'...' if len(style) > 350 else ''}" if style else "Style received: EMPTY",
            f"Character received: {character[:350]}{'...' if len(character) > 350 else ''}" if character else "Character received: EMPTY",
            f"Final prompt starts with: {final[:900]}{'...' if len(final) > 900 else ''}",
        ]
        return (final, "\n".join(status), overlay, overlay_enabled)


class NovaPromptStyleCharacterSwitchV5(NovaPromptStyleCharacterSwitchV4):
    """Same widget order as v4, with overlay_enabled BOOLEAN output for wiring into NovoLoko Overlay Text Pro enabled."""
    CATEGORY = "NovoLoko/Prompt"


class NovaPromptTwoStyleCharacterSwitchV1(NovaPromptStyleCharacterSwitchV4):
    """Final prompt builder for two style CSV loaders + one character CSV loader + manual/enhanced prompt.

    Input order is intentionally: style_prompt, style_prompt_2, character_prompt,
    manual_prompt, enhanced_prompt. This makes wiring clean when you use:
    - NovoLoko Load Styles CSV Pro for style.csv
    - NovoLoko Load Styles CSV Pro for a second style/pose/clothing CSV
    - NovoLoko Load Characters CSV Pro for character.csv
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "use_enhancer": ("BOOLEAN", {"default": True}),
                "include_style_1": ("BOOLEAN", {"default": True}),
                "include_style_2": ("BOOLEAN", {"default": True}),
                "include_character": ("BOOLEAN", {"default": True}),
                "prompt_order": ([
                    "style1_style2_character_prompt",
                    "style1_character_style2_prompt",
                    "character_style1_style2_prompt",
                    "style1_style2_prompt_character",
                    "prompt_style1_style2_character",
                    "prompt_character_style1_style2",
                    "character_prompt_style1_style2",
                ], {"default": "style1_style2_character_prompt"}),
                "style_1_prefix": (STYLE_PREFIX_OPTIONS, {"default": "Visual style / art direction:"}),
                "style_2_prefix": (STYLE_PREFIX_OPTIONS, {"default": "Custom"}),
                "character_prefix": (CHARACTER_PREFIX_OPTIONS, {"default": "Character reference:"}),
                "style_1_strength": (STRENGTH_OPTIONS, {"default": "nova_overkill"}),
                "style_2_strength": (STRENGTH_OPTIONS, {"default": "strong"}),
                "character_strength": (STRENGTH_OPTIONS, {"default": "literal_trigger_lock"}),
                "delimiter": ("STRING", {"default": ", "}),
            },
            "optional": {
                # Optional forceInput sockets: may be connected, but can be left empty without workflow errors.
                "style_prompt": ("STRING", {"forceInput": True}),
                "style_prompt_2": ("STRING", {"forceInput": True}),
                "character_prompt": ("STRING", {"forceInput": True}),
                "manual_prompt": ("STRING", {"forceInput": True}),
                "enhanced_prompt": ("STRING", {"forceInput": True}),
                "custom_style_1_prefix": ("STRING", {"default": "", "multiline": False}),
                "custom_style_2_prefix": ("STRING", {"default": "Secondary style / pose / clothing:", "multiline": False}),
                "custom_character_prefix": ("STRING", {"default": "", "multiline": False}),
                "extra_positive": ("STRING", {"multiline": True, "default": ""}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "BOOLEAN")
    RETURN_NAMES = ("final_prompt", "debug_status", "overlay_text", "overlay_enabled")
    FUNCTION = "build_prompt"
    CATEGORY = "NovoLoko/Prompt"

    def build_prompt(self, style_prompt="", style_prompt_2="", character_prompt="", manual_prompt="", enhanced_prompt="",
                     use_enhancer=True, include_style_1=True, include_style_2=True, include_character=True,
                     prompt_order="style1_style2_character_prompt",
                     style_1_prefix="Visual style / art direction:", style_2_prefix="Custom", character_prefix="Character reference:",
                     style_1_strength="nova_overkill", style_2_strength="strong", character_strength="literal_trigger_lock", delimiter=", ",
                     custom_style_1_prefix="", custom_style_2_prefix="Secondary style / pose / clothing:", custom_character_prefix="", extra_positive=""):
        style1 = self._clean(style_prompt)
        style2 = self._clean(style_prompt_2)
        character = self._clean(character_prompt)
        manual = self._clean(manual_prompt)
        enhanced = self._clean(enhanced_prompt)
        base = enhanced if use_enhancer else manual
        extra = self._clean(extra_positive)
        delim = delimiter if delimiter is not None else ", "

        style1_block = self._block(style1, style_1_prefix, custom_style_1_prefix, style_1_strength, kind="style") if include_style_1 else ""
        style2_block = self._block(style2, style_2_prefix, custom_style_2_prefix, style_2_strength, kind="style") if include_style_2 else ""
        character_block = self._block(character, character_prefix, custom_character_prefix, character_strength, kind="character") if include_character else ""
        prompt_block = base

        order_map = {
            "style1_style2_character_prompt": [style1_block, style2_block, character_block, prompt_block],
            "style1_character_style2_prompt": [style1_block, character_block, style2_block, prompt_block],
            "character_style1_style2_prompt": [character_block, style1_block, style2_block, prompt_block],
            "style1_style2_prompt_character": [style1_block, style2_block, prompt_block, character_block],
            "prompt_style1_style2_character": [prompt_block, style1_block, style2_block, character_block],
            "prompt_character_style1_style2": [prompt_block, character_block, style1_block, style2_block],
            "character_prompt_style1_style2": [character_block, prompt_block, style1_block, style2_block],
        }
        parts = list(order_map.get(prompt_order, order_map["style1_style2_character_prompt"]))
        if extra:
            parts.append(extra)
        final = delim.join([p for p in parts if p])

        overlay_parts = []
        if include_character and character and character_block:
            overlay_parts.append("CHAR: " + character.split(",")[0][:120])
        if include_style_1 and style1 and style1_block:
            overlay_parts.append("STYLE 1: " + style1.split(",")[0][:120])
        if include_style_2 and style2 and style2_block:
            overlay_parts.append("STYLE 2: " + style2.split(",")[0][:120])
        overlay = " | ".join(overlay_parts)
        overlay_enabled = bool(overlay.strip())

        status = [
            "NovoLoko Prompt Two Style + Character Switch v1",
            f"Mode: {'ENHANCER ON' if use_enhancer else 'MANUAL / ENHANCER BYPASSED'}",
            f"Prompt order: {prompt_order}",
            f"Style 1 included: {'yes' if include_style_1 and bool(style1) else 'no'} / strength: {style_1_strength} / prefix: {style_1_prefix}",
            f"Style 2 included: {'yes' if include_style_2 and bool(style2) else 'no'} / strength: {style_2_strength} / prefix: {style_2_prefix}",
            f"Character included: {'yes' if include_character and bool(character) else 'no'} / strength: {character_strength} / prefix: {character_prefix}",
            f"Overlay enabled output: {overlay_enabled} / overlay text: {overlay if overlay else 'EMPTY'}",
            f"Style 1 received: {style1[:350]}{'...' if len(style1) > 350 else ''}" if style1 else "Style 1 received: EMPTY",
            f"Style 2 received: {style2[:350]}{'...' if len(style2) > 350 else ''}" if style2 else "Style 2 received: EMPTY",
            f"Character received: {character[:350]}{'...' if len(character) > 350 else ''}" if character else "Character received: EMPTY",
            f"Base prompt received: {base[:350]}{'...' if len(base) > 350 else ''}" if base else "Base prompt received: EMPTY",
            f"Final prompt starts with: {final[:1000]}{'...' if len(final) > 1000 else ''}",
        ]
        return (final, "\n".join(status), overlay, overlay_enabled)


class NovaPromptTwoStyleCharacterPreEnhanceV1(NovaPromptStyleCharacterSwitchV4):
    """Build one combined prompt before sending it to a single prompt enhancer.

    This node is for the clean wiring:
    style CSV + second style/pose/clothes CSV + character CSV + manual prompt
    -> pre_enhance_prompt -> prompt enhancer -> CLIP/KSampler positive.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "include_style_1": ("BOOLEAN", {"default": True}),
                "include_style_2": ("BOOLEAN", {"default": True}),
                "include_character": ("BOOLEAN", {"default": True}),
                "prompt_order": ([
                    "style1_style2_character_prompt",
                    "style1_character_style2_prompt",
                    "character_style1_style2_prompt",
                    "style1_style2_prompt_character",
                    "prompt_style1_style2_character",
                    "prompt_character_style1_style2",
                    "character_prompt_style1_style2",
                ], {"default": "style1_style2_character_prompt"}),
                "style_1_prefix": (STYLE_PREFIX_OPTIONS, {"default": "Visual style / art direction:"}),
                "style_2_prefix": (STYLE_PREFIX_OPTIONS, {"default": "Custom"}),
                "character_prefix": (CHARACTER_PREFIX_OPTIONS, {"default": "Character reference:"}),
                "style_1_strength": (STRENGTH_OPTIONS, {"default": "normal"}),
                "style_2_strength": (STRENGTH_OPTIONS, {"default": "normal"}),
                "character_strength": (STRENGTH_OPTIONS, {"default": "normal"}),
                "delimiter": ("STRING", {"default": ", "}),
            },
            "optional": {
                # Optional forceInput sockets: may be connected, but can be left empty without workflow errors.
                "style_prompt": ("STRING", {"forceInput": True}),
                "style_prompt_2": ("STRING", {"forceInput": True}),
                "character_prompt": ("STRING", {"forceInput": True}),
                "manual_prompt": ("STRING", {"forceInput": True}),
                "custom_style_1_prefix": ("STRING", {"default": "", "multiline": False}),
                "custom_style_2_prefix": ("STRING", {"default": "Secondary style / pose / clothing:", "multiline": False}),
                "custom_character_prefix": ("STRING", {"default": "", "multiline": False}),
                "extra_positive": ("STRING", {"multiline": True, "default": ""}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "BOOLEAN")
    RETURN_NAMES = ("pre_enhance_prompt", "debug_status", "overlay_text", "overlay_enabled")
    FUNCTION = "build_prompt"
    CATEGORY = "NovoLoko/Prompt"

    def build_prompt(self, style_prompt="", style_prompt_2="", character_prompt="", manual_prompt="",
                     include_style_1=True, include_style_2=True, include_character=True,
                     prompt_order="style1_style2_character_prompt",
                     style_1_prefix="Visual style / art direction:", style_2_prefix="Custom", character_prefix="Character reference:",
                     style_1_strength="normal", style_2_strength="normal", character_strength="normal", delimiter=", ",
                     custom_style_1_prefix="", custom_style_2_prefix="Secondary style / pose / clothing:", custom_character_prefix="", extra_positive=""):
        style1 = self._clean(style_prompt)
        style2 = self._clean(style_prompt_2)
        character = self._clean(character_prompt)
        manual = self._clean(manual_prompt)
        extra = self._clean(extra_positive)
        delim = delimiter if delimiter is not None else ", "

        style1_block = self._block(style1, style_1_prefix, custom_style_1_prefix, style_1_strength, kind="style") if include_style_1 else ""
        style2_block = self._block(style2, style_2_prefix, custom_style_2_prefix, style_2_strength, kind="style") if include_style_2 else ""
        character_block = self._block(character, character_prefix, custom_character_prefix, character_strength, kind="character") if include_character else ""

        order_map = {
            "style1_style2_character_prompt": [style1_block, style2_block, character_block, manual],
            "style1_character_style2_prompt": [style1_block, character_block, style2_block, manual],
            "character_style1_style2_prompt": [character_block, style1_block, style2_block, manual],
            "style1_style2_prompt_character": [style1_block, style2_block, manual, character_block],
            "prompt_style1_style2_character": [manual, style1_block, style2_block, character_block],
            "prompt_character_style1_style2": [manual, character_block, style1_block, style2_block],
            "character_prompt_style1_style2": [character_block, manual, style1_block, style2_block],
        }
        parts = list(order_map.get(prompt_order, order_map["style1_style2_character_prompt"]))
        if extra:
            parts.append(extra)
        pre_enhance = delim.join([p for p in parts if p])

        overlay_parts = []
        if include_character and character and character_block:
            overlay_parts.append("CHAR: " + character.split(",")[0][:120])
        if include_style_1 and style1 and style1_block:
            overlay_parts.append("STYLE 1: " + style1.split(",")[0][:120])
        if include_style_2 and style2 and style2_block:
            overlay_parts.append("STYLE 2: " + style2.split(",")[0][:120])
        overlay = " | ".join(overlay_parts)
        overlay_enabled = bool(overlay.strip())

        status = [
            "NovoLoko Prompt Two Style + Character Pre-Enhance v1",
            "Mode: PRE-ENHANCER BUILDER",
            "Wire pre_enhance_prompt into one prompt enhancer, then send enhancer output to CLIP/KSampler positive.",
            f"Prompt order: {prompt_order}",
            f"Style 1 included: {'yes' if include_style_1 and bool(style1) else 'no'} / strength: {style_1_strength} / prefix: {style_1_prefix}",
            f"Style 2 included: {'yes' if include_style_2 and bool(style2) else 'no'} / strength: {style_2_strength} / prefix: {style_2_prefix}",
            f"Character included: {'yes' if include_character and bool(character) else 'no'} / strength: {character_strength} / prefix: {character_prefix}",
            f"Manual prompt received: {manual[:350]}{'...' if len(manual) > 350 else ''}" if manual else "Manual prompt received: EMPTY",
            f"Overlay enabled output: {overlay_enabled} / overlay text: {overlay if overlay else 'EMPTY'}",
            f"Pre-enhance prompt starts with: {pre_enhance[:1000]}{'...' if len(pre_enhance) > 1000 else ''}",
        ]
        return (pre_enhance, "\n".join(status), overlay, overlay_enabled)


class NovaStyleCharacterMixer:
    """Combine separate style and character loader outputs when you do not need the full enhancer switch."""
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "style_prompt": ("STRING", {"forceInput": True}),
            "character_prompt": ("STRING", {"forceInput": True}),
            "style_negative": ("STRING", {"forceInput": True}),
            "character_negative": ("STRING", {"forceInput": True}),
            "order": (["style_then_character", "character_then_style"], {"default": "character_then_style"}),
            "delimiter": ("STRING", {"default": ", "}),
        }, "optional": {
            "extra_positive": ("STRING", {"default": "", "multiline": True}),
            "extra_negative": ("STRING", {"default": "", "multiline": True}),
        }}
    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("positive_prompt", "negative_prompt", "info")
    FUNCTION = "mix"
    CATEGORY = "NovoLoko/Prompt"
    def mix(self, style_prompt, character_prompt, style_negative, character_negative, order="character_then_style", delimiter=", ", extra_positive="", extra_negative=""):
        delim = delimiter if delimiter is not None else ", "
        s = str(style_prompt or "").strip()
        c = str(character_prompt or "").strip()
        pos_parts = [s, c] if order == "style_then_character" else [c, s]
        if str(extra_positive or "").strip():
            pos_parts.append(str(extra_positive).strip())
        neg_parts = [str(style_negative or "").strip(), str(character_negative or "").strip()]
        if str(extra_negative or "").strip():
            neg_parts.append(str(extra_negative).strip())
        positive = delim.join([p for p in pos_parts if p])
        negative = delim.join([n for n in neg_parts if n])
        return (positive, negative, f"NovoLoko Style Character Mixer\nOrder: {order}\nStyle present: {bool(s)}\nCharacter present: {bool(c)}")


class NovaLoadCharactersCSVPro(LoadStylesCSVPro):
    CATEGORY = "NovoLoko/Character"

    @classmethod
    def _favorite_kind(cls):
        return "characters"

    @classmethod
    def INPUT_TYPES(cls):
        default_csv = DEFAULT_CHARACTER_CSV
        return {
            "required": {
                "csv_file_path": ("STRING", {"default": default_csv, "multiline": False}),
                "mode": (["Manual", "Random Every Queue", "Random From Seed", "Favorites Only", "Category Random", "Search Random", "Search First Match"], {"default": "Manual"}),
                # Validation-safe STRING; frontend converts it to a live CSV/YAML dropdown.
                "style": ("STRING", {"default": "No Character/None", "multiline": False}),
                "manual_style_name": ("STRING", {"default": "", "multiline": False}),
                "category": ("STRING", {"default": "All", "multiline": False}),
                "search": ("STRING", {"default": "", "multiline": False}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF}),
                "use_weighted_random": ("STRING", {"default": "true", "multiline": False}),
                "random_count": ("STRING", {"default": "1", "multiline": False}),
                "delimiter": ("STRING", {"default": ", ", "multiline": False}),
                "extra_positive": ("STRING", {"default": "", "multiline": True}),
                "extra_negative": ("STRING", {"default": "", "multiline": True}),
                "favorites_list": ("STRING", {"default": "", "multiline": True}),
                "save_to_history": ("BOOLEAN", {"default": True}),
                "refresh_id": ("INT", {"default": 0, "min": 0, "max": 999999999}),
                "style_name_trigger": (["Exact Search Trigger First", "Clean Style Name First", "Full Numbered Name First", "Off", "true", "false"], {"default": "Exact Search Trigger First"}),
                "search_overrides_manual": ("BOOLEAN", {"default": True}),
                "history_display_count": ("INT", {"default": 40, "min": 0, "max": 200}),
                "overlay_enabled": ("BOOLEAN", {"default": True}),
                "overlay_format": (["Number + Style", "Style Only", "Clean Style Name", "Trigger Only", "Style + Mode", "Style + Index", "Full Debug", "STYLE: "], {"default": "Number + Style"}),
                "overlay_prefix": ("STRING", {"default": "CHAR: ", "multiline": False}),
                "overlay_max_chars": ("INT", {"default": 140, "min": 20, "max": 500}),
                "selected_output_format": (["Clean Character Name", "Full Numbered Name", "Trigger Only"], {"default": "Clean Character Name"}),
                # v0.9 favorites: stored locally in custom_nodes/ComfyUI-NovoLoko/data/.
                "use_saved_favorites": ("BOOLEAN", {"default": True}),
                "favorite_action": (["None", "Add Selected To Favorites", "Remove Selected From Favorites", "Clear All Favorites"], {"default": "None"}),
                "favorites_display_count": ("INT", {"default": 30, "min": 0, "max": 300}),
            }
        }

    RETURN_NAMES = ("character prompt", "negative prompt", "selected character", "info", "selected index", "overlay text")


class NovaPromptSpice:
    """Pick random prompt fragments from a line-separated list."""
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "spice_lines": ("STRING", {"multiline": True, "default": "dramatic rim light\nlow angle view\nvolumetric haze\nrich texture detail\ncinematic color grade"}),
            "count": ("INT", {"default": 2, "min": 0, "max": 20}),
            "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF}),
            "random_every_queue": ("BOOLEAN", {"default": True}),
            "delimiter": ("STRING", {"default": ", "}),
        }}
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("spice_prompt", "info")
    FUNCTION = "run"
    CATEGORY = "NovoLoko/Prompt"
    @classmethod
    def IS_CHANGED(cls, spice_lines, count, seed, random_every_queue, delimiter):
        return time.time_ns() if random_every_queue else (spice_lines, count, seed, delimiter)
    def run(self, spice_lines, count, seed, random_every_queue=True, delimiter=", "):
        lines = [x.strip() for x in (spice_lines or "").replace(";", "\n").splitlines() if x.strip()]
        if not lines or int(count) <= 0:
            return ("", "No spice selected")
        rng = random.Random(time.time_ns() ^ random.getrandbits(64)) if random_every_queue else random.Random(int(seed))
        picked = rng.sample(lines, k=min(int(count), len(lines)))
        text = (delimiter or ", ").join(picked)
        return (text, "Picked:\n" + "\n".join(f"- {p}" for p in picked))


class NovaSecretSaucePrompt:
    """Simple non-LLM prompt seasoning block for Krea-style workflows."""
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "base_prompt": ("STRING", {"forceInput": True}),
            "mode": (["Cinematic", "Anime", "Fantasy Art", "Horror", "Reference Sheet", "Product Shot", "Comic Cover"], {"default": "Cinematic"}),
            "intensity": (["light", "medium", "heavy"], {"default": "medium"}),
            "include_lighting": ("BOOLEAN", {"default": True}),
            "include_composition": ("BOOLEAN", {"default": True}),
            "delimiter": ("STRING", {"default": ", "}),
        }}
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt", "info")
    FUNCTION = "run"
    CATEGORY = "NovoLoko/Prompt"
    def run(self, base_prompt, mode="Cinematic", intensity="medium", include_lighting=True, include_composition=True, delimiter=", "):
        base = str(base_prompt or "").strip()
        packs = {
            "Cinematic": ["cinematic framing", "premium film still", "rich production design", "controlled depth of field"],
            "Anime": ["anime key visual", "clean expressive shapes", "crisp line confidence", "polished animation background"],
            "Fantasy Art": ["epic fantasy illustration", "mythic atmosphere", "painterly texture", "dramatic scale"],
            "Horror": ["moody horror atmosphere", "uneasy tension", "ominous shadows", "disturbing quiet detail"],
            "Reference Sheet": ["clear reference sheet layout", "consistent character design", "front side back readability", "clean neutral presentation"],
            "Product Shot": ["studio product photography", "clean hero angle", "premium material detail", "commercial polish"],
            "Comic Cover": ["dynamic comic cover composition", "bold readable silhouette", "dramatic action pose", "inked graphic energy"],
        }
        extras = list(packs.get(mode, []))
        if intensity == "light": extras = extras[:2]
        elif intensity == "heavy": extras += ["high detail finish", "strong art direction", "cohesive visual language"]
        if include_lighting: extras += ["intentional lighting", "clear highlight and shadow structure"]
        if include_composition: extras += ["strong focal point", "balanced foreground midground background"]
        parts = [base] + extras
        text = (delimiter or ", ").join([p for p in parts if p])
        return (text, f"NovoLoko Secret Sauce: {mode} / {intensity}\nAdded {len(extras)} prompt fragments")


def _hex_to_rgba(value, alpha=255, fallback=(0,0,0,255)):
    try:
        s = str(value or "").strip().lstrip('#')
        if len(s) == 3:
            s = ''.join(c*2 for c in s)
        if len(s) != 6:
            return fallback
        r,g,b = int(s[0:2],16), int(s[2:4],16), int(s[4:6],16)
        return (r,g,b,int(alpha))
    except Exception:
        return fallback


def _find_font_file(possible_names):
    """Find an installed font file without shipping any fonts."""
    names = [str(x).lower() for x in possible_names if x]
    roots = [
        "C:/Windows/Fonts",
        "/usr/share/fonts",
        "/usr/local/share/fonts",
        os.path.expanduser("~/.fonts"),
        os.path.expanduser("~/Library/Fonts"),
        "/Library/Fonts",
        "/System/Library/Fonts",
    ]
    for root in roots:
        if not os.path.isdir(root):
            continue
        try:
            for dirpath, _, filenames in os.walk(root):
                for fn in filenames:
                    if fn.lower() in names:
                        return os.path.join(dirpath, fn)
        except Exception:
            continue
    return None


class NovaOverlayText:
    """Overlay text onto an IMAGE tensor. Pro stamp node for style labels, watermarks, and saved-image metadata."""
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            # Keep the original first widgets in the same order for workflow compatibility.
            "image": ("IMAGE", {"forceInput": True}),
            "text": ("STRING", {"forceInput": True}),
            "enabled": ("BOOLEAN", {"default": True}),
            "position": (["top_left", "top_center", "top_right", "middle_left", "center", "middle_right", "bottom_left", "bottom_center", "bottom_right", "custom_xy"], {"default": "bottom_left"}),
            "font_size": ("INT", {"default": 28, "min": 6, "max": 260}),
            "margin": ("INT", {"default": 24, "min": 0, "max": 600}),
            "max_width_percent": ("INT", {"default": 92, "min": 10, "max": 100}),
            "text_color_hex": ("STRING", {"default": "FFFFFF", "multiline": False}),
            "box_color_hex": ("STRING", {"default": "000000", "multiline": False}),
            "box_opacity": ("FLOAT", {"default": 0.55, "min": 0.0, "max": 1.0, "step": 0.05}),
            "text_opacity": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.05}),

            # Pro options appended after the old widget order so older workflows do not value-shift.
            "font_preset": (["Auto", "Arial", "Arial Bold", "Segoe UI", "Calibri", "Verdana", "Tahoma", "Trebuchet MS", "Times New Roman", "Georgia", "Comic Sans MS", "Impact", "Consolas", "Courier New", "Bahnschrift", "Franklin Gothic Medium", "Century Gothic", "Candara", "Corbel", "Cambria", "Garamond", "Palatino Linotype", "Book Antiqua", "Lucida Sans", "Lucida Sans Unicode", "Lucida Console", "Microsoft YaHei", "Yu Gothic", "Meiryo", "Malgun Gothic", "Nirmala UI", "Ink Free", "Sitka", "Cascadia Code", "Cascadia Mono", "Noto Sans", "Noto Serif", "Roboto", "Montserrat", "Oswald", "Bebas Neue", "Anton", "Liberation Sans", "Liberation Serif", "DejaVu Sans", "DejaVu Serif", "Custom Font Path"], {"default": "Arial Bold"}),
            "font_file": ("STRING", {"default": "", "multiline": False}),
            "font_style": (["Regular", "Bold", "Italic", "Bold Italic"], {"default": "Bold"}),
            "text_align": (["left", "center", "right"], {"default": "left"}),
            "text_case": (["keep", "UPPER", "lower", "Title"], {"default": "keep"}),
            "max_lines": ("INT", {"default": 2, "min": 1, "max": 20}),
            "line_spacing": ("FLOAT", {"default": 1.15, "min": 0.7, "max": 3.0, "step": 0.05}),
            "padding_x": ("INT", {"default": 14, "min": 0, "max": 300}),
            "padding_y": ("INT", {"default": 9, "min": 0, "max": 300}),
            "box_enabled": ("BOOLEAN", {"default": True}),
            "box_radius": ("INT", {"default": 10, "min": 0, "max": 160}),
            "stroke_width": ("INT", {"default": 1, "min": 0, "max": 20}),
            "stroke_color_hex": ("STRING", {"default": "000000", "multiline": False}),
            "stroke_opacity": ("FLOAT", {"default": 0.85, "min": 0.0, "max": 1.0, "step": 0.05}),
            "shadow_enabled": ("BOOLEAN", {"default": True}),
            "shadow_color_hex": ("STRING", {"default": "000000", "multiline": False}),
            "shadow_opacity": ("FLOAT", {"default": 0.55, "min": 0.0, "max": 1.0, "step": 0.05}),
            "shadow_offset_x": ("INT", {"default": 2, "min": -80, "max": 80}),
            "shadow_offset_y": ("INT", {"default": 2, "min": -80, "max": 80}),
            "shadow_blur": ("INT", {"default": 2, "min": 0, "max": 40}),
            "x_offset": ("INT", {"default": 0, "min": -4000, "max": 4000}),
            "y_offset": ("INT", {"default": 0, "min": -4000, "max": 4000}),
            "rotate_degrees": ("FLOAT", {"default": 0.0, "min": -180.0, "max": 180.0, "step": 1.0}),
        }}

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "overlay"
    CATEGORY = "NovoLoko/Image"

    def _font(self, size, font_preset="Arial Bold", font_file="", font_style="Bold"):
        from PIL import ImageFont
        size = max(6, int(size or 28))
        preset = str(font_preset or "Auto").strip()
        style = str(font_style or "Regular").strip().lower()
        custom = str(font_file or "").strip().strip('"')

        # Direct custom path wins, even if the preset is not explicitly Custom.
        candidates = []
        if custom:
            candidates.append(custom)

        win = "C:/Windows/Fonts"
        linux = "/usr/share/fonts/truetype"
        # Windows font filename map. These are common on Windows 10/11.
        maps = {
            "Arial": {"regular": "arial.ttf", "bold": "arialbd.ttf", "italic": "ariali.ttf", "bold italic": "arialbi.ttf"},
            "Arial Bold": {"regular": "arialbd.ttf", "bold": "arialbd.ttf", "italic": "arialbi.ttf", "bold italic": "arialbi.ttf"},
            "Segoe UI": {"regular": "segoeui.ttf", "bold": "segoeuib.ttf", "italic": "segoeuii.ttf", "bold italic": "segoeuiz.ttf"},
            "Calibri": {"regular": "calibri.ttf", "bold": "calibrib.ttf", "italic": "calibrii.ttf", "bold italic": "calibriz.ttf"},
            "Verdana": {"regular": "verdana.ttf", "bold": "verdanab.ttf", "italic": "verdanai.ttf", "bold italic": "verdanaz.ttf"},
            "Tahoma": {"regular": "tahoma.ttf", "bold": "tahomabd.ttf", "italic": "tahoma.ttf", "bold italic": "tahomabd.ttf"},
            "Trebuchet MS": {"regular": "trebuc.ttf", "bold": "trebucbd.ttf", "italic": "trebucit.ttf", "bold italic": "trebucbi.ttf"},
            "Times New Roman": {"regular": "times.ttf", "bold": "timesbd.ttf", "italic": "timesi.ttf", "bold italic": "timesbi.ttf"},
            "Georgia": {"regular": "georgia.ttf", "bold": "georgiab.ttf", "italic": "georgiai.ttf", "bold italic": "georgiaz.ttf"},
            "Comic Sans MS": {"regular": "comic.ttf", "bold": "comicbd.ttf", "italic": "comici.ttf", "bold italic": "comicz.ttf"},
            "Impact": {"regular": "impact.ttf", "bold": "impact.ttf", "italic": "impact.ttf", "bold italic": "impact.ttf"},
            "Consolas": {"regular": "consola.ttf", "bold": "consolab.ttf", "italic": "consolai.ttf", "bold italic": "consolaz.ttf"},
            "Courier New": {"regular": "cour.ttf", "bold": "courbd.ttf", "italic": "couri.ttf", "bold italic": "courbi.ttf"},
            "Bahnschrift": {"regular": "bahnschrift.ttf", "bold": "bahnschrift.ttf", "italic": "bahnschrift.ttf", "bold italic": "bahnschrift.ttf"},
            "Franklin Gothic Medium": {"regular": "framd.ttf", "bold": "framd.ttf", "italic": "framdit.ttf", "bold italic": "framdit.ttf"},
            "Century Gothic": {"regular": "gothic.ttf", "bold": "gothicb.ttf", "italic": "gothici.ttf", "bold italic": "gothicbi.ttf"},
            "Candara": {"regular": "candara.ttf", "bold": "candarab.ttf", "italic": "candarai.ttf", "bold italic": "candaraz.ttf"},
            "Corbel": {"regular": "corbel.ttf", "bold": "corbelb.ttf", "italic": "corbeli.ttf", "bold italic": "corbelz.ttf"},
            "Cambria": {"regular": "cambria.ttc", "bold": "cambriab.ttf", "italic": "cambriai.ttf", "bold italic": "cambriaz.ttf"},
            "Garamond": {"regular": "gara.ttf", "bold": "garabd.ttf", "italic": "garait.ttf", "bold italic": "garait.ttf"},
            "Palatino Linotype": {"regular": "pala.ttf", "bold": "palab.ttf", "italic": "palai.ttf", "bold italic": "palabi.ttf"},
            "Book Antiqua": {"regular": "BKANT.TTF", "bold": "ANTQUAB.TTF", "italic": "ANTQUAI.TTF", "bold italic": "ANTQUABI.TTF"},
            "Lucida Sans": {"regular": "lsans.ttf", "bold": "lsansd.ttf", "italic": "lsansi.ttf", "bold italic": "lsansdi.ttf"},
            "Lucida Sans Unicode": {"regular": "l_10646.ttf", "bold": "l_10646.ttf", "italic": "l_10646.ttf", "bold italic": "l_10646.ttf"},
            "Lucida Console": {"regular": "lucon.ttf", "bold": "lucon.ttf", "italic": "lucon.ttf", "bold italic": "lucon.ttf"},
            "Microsoft YaHei": {"regular": "msyh.ttc", "bold": "msyhbd.ttc", "italic": "msyh.ttc", "bold italic": "msyhbd.ttc"},
            "Yu Gothic": {"regular": "YuGothR.ttc", "bold": "YuGothB.ttc", "italic": "YuGothR.ttc", "bold italic": "YuGothB.ttc"},
            "Meiryo": {"regular": "meiryo.ttc", "bold": "meiryob.ttc", "italic": "meiryo.ttc", "bold italic": "meiryob.ttc"},
            "Malgun Gothic": {"regular": "malgun.ttf", "bold": "malgunbd.ttf", "italic": "malgun.ttf", "bold italic": "malgunbd.ttf"},
            "Nirmala UI": {"regular": "nirmala.ttf", "bold": "nirmalab.ttf", "italic": "nirmala.ttf", "bold italic": "nirmalab.ttf"},
            "Ink Free": {"regular": "Inkfree.ttf", "bold": "Inkfree.ttf", "italic": "Inkfree.ttf", "bold italic": "Inkfree.ttf"},
            "Sitka": {"regular": "Sitka.ttc", "bold": "Sitka.ttc", "italic": "Sitka.ttc", "bold italic": "Sitka.ttc"},
            "Cascadia Code": {"regular": "CascadiaCode.ttf", "bold": "CascadiaCode.ttf", "italic": "CascadiaCodeItalic.ttf", "bold italic": "CascadiaCodeItalic.ttf"},
            "Cascadia Mono": {"regular": "CascadiaMono.ttf", "bold": "CascadiaMono.ttf", "italic": "CascadiaMonoItalic.ttf", "bold italic": "CascadiaMonoItalic.ttf"},
            "Noto Sans": {"regular": "NotoSans-Regular.ttf", "bold": "NotoSans-Bold.ttf", "italic": "NotoSans-Italic.ttf", "bold italic": "NotoSans-BoldItalic.ttf"},
            "Noto Serif": {"regular": "NotoSerif-Regular.ttf", "bold": "NotoSerif-Bold.ttf", "italic": "NotoSerif-Italic.ttf", "bold italic": "NotoSerif-BoldItalic.ttf"},
            "Roboto": {"regular": "Roboto-Regular.ttf", "bold": "Roboto-Bold.ttf", "italic": "Roboto-Italic.ttf", "bold italic": "Roboto-BoldItalic.ttf"},
            "Montserrat": {"regular": "Montserrat-Regular.ttf", "bold": "Montserrat-Bold.ttf", "italic": "Montserrat-Italic.ttf", "bold italic": "Montserrat-BoldItalic.ttf"},
            "Oswald": {"regular": "Oswald-Regular.ttf", "bold": "Oswald-Bold.ttf", "italic": "Oswald-Regular.ttf", "bold italic": "Oswald-Bold.ttf"},
            "Bebas Neue": {"regular": "BebasNeue-Regular.ttf", "bold": "BebasNeue-Regular.ttf", "italic": "BebasNeue-Regular.ttf", "bold italic": "BebasNeue-Regular.ttf"},
            "Anton": {"regular": "Anton-Regular.ttf", "bold": "Anton-Regular.ttf", "italic": "Anton-Regular.ttf", "bold italic": "Anton-Regular.ttf"},
            "Liberation Sans": {"regular": "LiberationSans-Regular.ttf", "bold": "LiberationSans-Bold.ttf", "italic": "LiberationSans-Italic.ttf", "bold italic": "LiberationSans-BoldItalic.ttf"},
            "Liberation Serif": {"regular": "LiberationSerif-Regular.ttf", "bold": "LiberationSerif-Bold.ttf", "italic": "LiberationSerif-Italic.ttf", "bold italic": "LiberationSerif-BoldItalic.ttf"},
            "DejaVu Serif": {"regular": "DejaVuSerif.ttf", "bold": "DejaVuSerif-Bold.ttf", "italic": "DejaVuSerif-Italic.ttf", "bold italic": "DejaVuSerif-BoldItalic.ttf"},
        }
        if preset in maps:
            chosen = maps[preset].get(style) or maps[preset].get("regular")
            candidates.append(os.path.join(win, chosen))
            # Add common fallbacks for the same family.
            candidates.extend(os.path.join(win, f) for f in maps[preset].values())
            found = _find_font_file([chosen] + list(maps[preset].values()))
            if found:
                candidates.append(found)
        elif preset == "DejaVu Sans":
            candidates += [
                os.path.join(linux, "dejavu", "DejaVuSans-Bold.ttf" if "bold" in style else "DejaVuSans.ttf"),
                os.path.join(linux, "dejavu", "DejaVuSans.ttf"),
                os.path.join(linux, "dejavu", "DejaVuSansCondensed.ttf"),
            ]

        # Auto/fallback candidates across Windows and Linux.
        candidates += [
            os.path.join(win, "arialbd.ttf"), os.path.join(win, "arial.ttf"),
            os.path.join(win, "segoeuib.ttf"), os.path.join(win, "segoeui.ttf"),
            os.path.join(win, "calibrib.ttf"), os.path.join(win, "calibri.ttf"),
            os.path.join(win, "impact.ttf"), os.path.join(win, "comic.ttf"),
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
            "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
        ]
        seen = set()
        for p in candidates:
            if not p or p in seen:
                continue
            seen.add(p)
            try:
                if os.path.exists(p):
                    return ImageFont.truetype(p, size)
            except Exception:
                pass
        return ImageFont.load_default()

    def _apply_case(self, text, text_case):
        mode = str(text_case or "keep")
        if mode == "UPPER":
            return str(text or "").upper()
        if mode == "lower":
            return str(text or "").lower()
        if mode == "Title":
            return str(text or "").title()
        return str(text or "")

    def _measure(self, draw, text, font, stroke_width=0):
        try:
            b = draw.textbbox((0, 0), text, font=font, stroke_width=int(stroke_width or 0))
            return max(0, b[2] - b[0]), max(1, b[3] - b[1]), b
        except Exception:
            return max(1, len(text) * 10), 16, (0, 0, max(1, len(text) * 10), 16)

    def _truncate_to_width(self, draw, text, font, max_width, stroke_width=0):
        ell = "…"
        if self._measure(draw, text, font, stroke_width)[0] <= max_width:
            return text
        s = text
        while s and self._measure(draw, s + ell, font, stroke_width)[0] > max_width:
            s = s[:-1]
        return (s.rstrip() + ell) if s else ell

    def _wrap(self, draw, text, font, max_width, max_lines=2, stroke_width=0):
        text = str(text or "").replace("\r", "")
        paragraphs = text.split("\n") if text else [""]
        lines = []
        for para in paragraphs:
            words = para.split()
            if not words:
                lines.append("")
                continue
            cur = ""
            for w in words:
                test = (cur + " " + w).strip()
                if self._measure(draw, test, font, stroke_width)[0] <= max_width or not cur:
                    cur = test
                else:
                    lines.append(cur)
                    cur = w
            if cur:
                lines.append(cur)
        max_lines = max(1, int(max_lines or 1))
        if len(lines) > max_lines:
            kept = lines[:max_lines]
            # Compress remaining text into an ellipsized last line so long labels stay readable.
            tail = " ".join(lines[max_lines-1:])
            kept[-1] = self._truncate_to_width(draw, tail, font, max_width, stroke_width)
            return kept
        return lines or [""]

    def _position(self, W, H, sw, sh, position, margin, x_offset, y_offset):
        m = int(margin or 0)
        pos = str(position or "bottom_left")
        if pos == "custom_xy":
            x, y = m, m
        elif "right" in pos:
            x = W - sw - m
        elif "center" in pos:
            x = (W - sw) // 2
        else:
            x = m
        if pos == "center":
            y = (H - sh) // 2
        elif "middle" in pos:
            y = (H - sh) // 2
        elif "top" in pos:
            y = m
        else:
            y = H - sh - m
        return int(x + int(x_offset or 0)), int(y + int(y_offset or 0))

    @classmethod
    def IS_CHANGED(cls, image, text, enabled=True, position="bottom_left", font_size=28, margin=24,
                   max_width_percent=92, text_color_hex="FFFFFF", box_color_hex="000000", box_opacity=0.55, text_opacity=1.0,
                   font_preset="Arial Bold", font_file="", font_style="Bold", text_align="left", text_case="keep",
                   max_lines=2, line_spacing=1.15, padding_x=14, padding_y=9, box_enabled=True, box_radius=10,
                   stroke_width=1, stroke_color_hex="000000", stroke_opacity=0.85,
                   shadow_enabled=True, shadow_color_hex="000000", shadow_opacity=0.55, shadow_offset_x=2, shadow_offset_y=2,
                   shadow_blur=2, x_offset=0, y_offset=0, rotate_degrees=0.0):
        return (text, enabled, position, font_size, margin, max_width_percent, text_color_hex, box_color_hex,
                box_opacity, text_opacity, font_preset, font_file, font_style, text_align, text_case,
                max_lines, line_spacing, padding_x, padding_y, box_enabled, box_radius, stroke_width,
                stroke_color_hex, stroke_opacity, shadow_enabled, shadow_color_hex, shadow_opacity,
                shadow_offset_x, shadow_offset_y, shadow_blur, x_offset, y_offset, rotate_degrees)

    def overlay(self, image, text, enabled=True, position="bottom_left", font_size=28, margin=24,
                max_width_percent=92, text_color_hex="FFFFFF", box_color_hex="000000", box_opacity=0.55, text_opacity=1.0,
                font_preset="Arial Bold", font_file="", font_style="Bold", text_align="left", text_case="keep",
                max_lines=2, line_spacing=1.15, padding_x=14, padding_y=9, box_enabled=True, box_radius=10,
                stroke_width=1, stroke_color_hex="000000", stroke_opacity=0.85,
                shadow_enabled=True, shadow_color_hex="000000", shadow_opacity=0.55, shadow_offset_x=2, shadow_offset_y=2,
                shadow_blur=2, x_offset=0, y_offset=0, rotate_degrees=0.0):
        if not enabled or not str(text or "").strip():
            return (image,)
        import torch
        import numpy as np
        from PIL import Image, ImageDraw, ImageFilter

        device = image.device if hasattr(image, "device") else None
        dtype = image.dtype if hasattr(image, "dtype") else None
        font = self._font(font_size, font_preset, font_file, font_style)
        clean_text = self._apply_case(text, text_case)
        imgs = []

        for img in image:
            arr = (img.detach().cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
            pil = Image.fromarray(arr).convert("RGBA")
            W, H = pil.size
            dummy = Image.new("RGBA", (max(1, W), max(1, H)), (0, 0, 0, 0))
            draw = ImageDraw.Draw(dummy)
            max_w = int(W * max(10, min(100, int(max_width_percent or 92))) / 100.0) - 2 * int(margin or 0)
            max_w = max(40, max_w)
            swidth = max(0, int(stroke_width or 0))
            lines = self._wrap(draw, clean_text, font, max_w, max_lines=max_lines, stroke_width=swidth)
            measured = [self._measure(draw, line, font, swidth) for line in lines]
            line_ws = [m[0] for m in measured]
            line_hs = [m[1] for m in measured]
            text_w = max(line_ws or [1])
            base_line_h = max(line_hs or [max(1, int(font_size or 28))])
            gap = max(0, int(base_line_h * (float(line_spacing or 1.15) - 1.0)))
            text_h = sum(line_hs) + gap * max(0, len(lines) - 1)
            px, py = max(0, int(padding_x or 0)), max(0, int(padding_y or 0))
            shadow_pad = max(abs(int(shadow_offset_x or 0)), abs(int(shadow_offset_y or 0)), int(shadow_blur or 0)) + swidth + 4
            stamp_w = max(1, text_w + px * 2 + shadow_pad * 2)
            stamp_h = max(1, text_h + py * 2 + shadow_pad * 2)
            stamp = Image.new("RGBA", (stamp_w, stamp_h), (0, 0, 0, 0))
            sdraw = ImageDraw.Draw(stamp)
            box_alpha = int(255 * max(0.0, min(1.0, float(box_opacity or 0.0))))
            text_alpha = int(255 * max(0.0, min(1.0, float(text_opacity or 0.0))))
            stroke_alpha = int(255 * max(0.0, min(1.0, float(stroke_opacity or 0.0))))
            if box_enabled and box_alpha > 0:
                sdraw.rounded_rectangle(
                    [shadow_pad, shadow_pad, stamp_w - shadow_pad, stamp_h - shadow_pad],
                    radius=max(0, int(box_radius or 0)),
                    fill=_hex_to_rgba(box_color_hex, box_alpha, (0, 0, 0, box_alpha))
                )

            text_color = _hex_to_rgba(text_color_hex, text_alpha, (255, 255, 255, text_alpha))
            stroke_color = _hex_to_rgba(stroke_color_hex, stroke_alpha, (0, 0, 0, stroke_alpha))
            shadow_color = _hex_to_rgba(shadow_color_hex, int(255 * max(0.0, min(1.0, float(shadow_opacity or 0.0)))), (0, 0, 0, 140))

            # Optional soft shadow drawn to a separate layer so blur stays behind the text.
            if shadow_enabled and shadow_color[3] > 0:
                shadow_layer = Image.new("RGBA", stamp.size, (0, 0, 0, 0))
                shdraw = ImageDraw.Draw(shadow_layer)
                ty = shadow_pad + py + int(shadow_offset_y or 0)
                for line, (lw, lh, _) in zip(lines, measured):
                    if text_align == "center":
                        tx = shadow_pad + px + (text_w - lw) // 2
                    elif text_align == "right":
                        tx = shadow_pad + px + (text_w - lw)
                    else:
                        tx = shadow_pad + px
                    tx += int(shadow_offset_x or 0)
                    shdraw.text((tx, ty), line, font=font, fill=shadow_color, stroke_width=swidth, stroke_fill=shadow_color)
                    ty += lh + gap
                blur = int(shadow_blur or 0)
                if blur > 0:
                    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=blur))
                stamp.alpha_composite(shadow_layer)
                sdraw = ImageDraw.Draw(stamp)

            ty = shadow_pad + py
            for line, (lw, lh, _) in zip(lines, measured):
                if text_align == "center":
                    tx = shadow_pad + px + (text_w - lw) // 2
                elif text_align == "right":
                    tx = shadow_pad + px + (text_w - lw)
                else:
                    tx = shadow_pad + px
                sdraw.text((tx, ty), line, font=font, fill=text_color, stroke_width=swidth, stroke_fill=stroke_color)
                ty += lh + gap

            try:
                rot = float(rotate_degrees or 0.0)
            except Exception:
                rot = 0.0
            if abs(rot) > 0.01:
                stamp = stamp.rotate(rot, expand=True, resample=Image.BICUBIC)

            overlay = Image.new("RGBA", pil.size, (0, 0, 0, 0))
            x, y = self._position(W, H, stamp.size[0], stamp.size[1], position, margin, x_offset, y_offset)
            overlay.alpha_composite(stamp, (x, y))
            out = Image.alpha_composite(pil, overlay).convert("RGB")
            imgs.append(torch.from_numpy(np.asarray(out).astype(np.float32) / 255.0))
        result = torch.stack(imgs, dim=0)
        if device is not None:
            result = result.to(device=device)
        if dtype is not None:
            result = result.to(dtype=dtype)
        return (result,)


class NovaPromptLogger:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "prompt": ("STRING", {"forceInput": True}),
            "style": ("STRING", {"default": "", "multiline": False}),
            "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF}),
            "enabled": ("BOOLEAN", {"default": True}),
            "filename": ("STRING", {"default": "nova_prompt_log.jsonl", "multiline": False}),
        }, "optional": {
            "negative": ("STRING", {"default": "", "multiline": True}),
            "notes": ("STRING", {"default": "", "multiline": True}),
        }}
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("status",)
    FUNCTION = "log"
    CATEGORY = "NovoLoko/Utility"
    def log(self, prompt, style="", seed=0, enabled=True, filename="nova_prompt_log.jsonl", negative="", notes=""):
        if not enabled:
            return ("NovoLoko Prompt Logger disabled",)
        root = _comfy_root()
        d = os.path.join(root, "output", "NovoLoko")
        os.makedirs(d, exist_ok=True)
        safe = os.path.basename(filename or "nova_prompt_log.jsonl")
        path = os.path.join(d, safe)
        entry = {"time": int(time.time()), "style": style, "seed": int(seed), "prompt": prompt, "negative": negative, "notes": notes}
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        return (f"Logged to {path}",)


class NovaTextPrompt:
    """Simple multiline manual prompt source retained from NovoLoko."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "prompt": ("STRING", {"default": "", "multiline": True}),
            "prefix": ("STRING", {"default": "", "multiline": False}),
            "suffix": ("STRING", {"default": "", "multiline": False}),
            "enabled": ("BOOLEAN", {"default": True}),
        }}

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "build"
    CATEGORY = "NovoLoko/Prompt"

    def build(self, prompt="", prefix="", suffix="", enabled=True):
        if not enabled:
            return ("",)
        parts = [str(prefix or "").strip(), str(prompt or "").strip(), str(suffix or "").strip()]
        return (", ".join(part for part in parts if part),)


class NovaPromptPreview:
    """Display a final or pre-enhancer prompt in ComfyUI's execution UI."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": ("STRING", {"forceInput": True}),
                "title": ("STRING", {"default": "NovoLoko Prompt Preview", "multiline": False}),
            },
            "optional": {
                "debug_status": ("STRING", {"forceInput": True}),
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "show"
    OUTPUT_NODE = True
    CATEGORY = "NovoLoko/Utility"

    def show(self, prompt="", title="NovoLoko Prompt Preview", debug_status=""):
        heading = str(title or "NovoLoko Prompt Preview").strip()
        body = str(prompt or "")
        debug = str(debug_status or "").strip()
        display = f"{heading}\n\n{body}"
        if debug:
            display += f"\n\n--- Debug ---\n{debug}"
        return {"ui": {"text": [display]}, "result": ()}


NODE_CLASS_MAPPINGS = {
    "NovaLoadStylesCSVPro": LoadStylesCSVPro,
    "NovaLoadCharactersCSVPro": NovaLoadCharactersCSVPro,
    "NovaPromptBuilderPreEnhance": NovaPromptTwoStyleCharacterPreEnhanceV1,
    "NovaTextPrompt": NovaTextPrompt,
    "NovaPromptPreview": NovaPromptPreview,
    "NovaPromptStyleSwitch": NovaPromptStyleSwitchV3,
    "NovaPromptStyleCharacterSwitch": NovaPromptStyleCharacterSwitchV5,
    "NovaPromptTwoStyleCharacterSwitch": NovaPromptTwoStyleCharacterSwitchV1,
    "NovaStyleCharacterMixer": NovaStyleCharacterMixer,
    "NovaPromptSpice": NovaPromptSpice,
    "NovaSecretSaucePrompt": NovaSecretSaucePrompt,
    "NovaOverlayTextPro": NovaOverlayText,
    "NovaPromptLogger": NovaPromptLogger,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "NovaLoadStylesCSVPro": "NovoLoko CSV Style Loader",
    "NovaLoadCharactersCSVPro": "NovoLoko CSV Character Loader",
    "NovaPromptBuilderPreEnhance": "NovoLoko Prompt Builder — Pre-Enhancer",
    "NovaTextPrompt": "NovoLoko Text Prompt",
    "NovaPromptPreview": "NovoLoko Prompt Preview",
    "NovaPromptStyleSwitch": "NovoLoko Prompt Style Switch",
    "NovaPromptStyleCharacterSwitch": "NovoLoko Prompt Style + Character Switch",
    "NovaPromptTwoStyleCharacterSwitch": "NovoLoko Prompt 2 Styles + Character Switch",
    "NovaStyleCharacterMixer": "NovoLoko Style + Character Mixer",
    "NovaPromptSpice": "NovoLoko Prompt Spice",
    "NovaSecretSaucePrompt": "NovoLoko Secret Sauce Prompt",
    "NovaOverlayTextPro": "NovoLoko Overlay Text Pro",
    "NovaPromptLogger": "NovoLoko Prompt Logger",
}


# Optional frontend refresh endpoint. The node still works without this.
try:
    from server import PromptServer
    from aiohttp import web

    @PromptServer.instance.routes.get("/nova_styles_csv_pro/list")
    async def nova_styles_csv_pro_list(request):
        csv_file_path = request.query.get("csv", DEFAULT_CSV)
        search = request.query.get("search", "")
        category = request.query.get("category", "All")
        try:
            styles = _read_styles(csv_file_path)
            cats = ["All"] + sorted(set(s["category"] for s in styles))
            kind = request.query.get("kind", "styles")
            favorites_only = str(request.query.get("favorites_only", "false")).lower() in {"1", "true", "yes", "on"}
            filtered = _filter_styles(styles, category, search, favorites_only, "", saved_favorites=_load_favorites(kind)) if (search or category != "All" or favorites_only) else styles
            if not filtered:
                filtered = styles
            is_char = "char" in str(kind or "").lower()
            style_rescue = ["No Character/None", "0000 | No Character/None"] if is_char else ["No Style", "0000 | No Style"]
            category_rescue = ["All", "No Character"] if is_char else ["All", "No Style"]
            return web.json_response({
                "ok": True,
                "styles": _merge_unique_lists(style_rescue, [s["name"] for s in filtered]),
                "categories": _merge_unique_lists(category_rescue, cats),
                "count": len(styles),
                "filtered_count": len(filtered),
                "resolved_path": _resolve_csv_path(csv_file_path),
            })
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    @PromptServer.instance.routes.get("/nova_favorites/list")
    async def nova_favorites_list(request):
        kind = request.query.get("kind", "styles")
        return web.json_response({"ok": True, "kind": kind, "favorites": _load_favorites(kind)})

    @PromptServer.instance.routes.post("/nova_favorites/action")
    async def nova_favorites_action(request):
        try:
            data = await request.json()
            kind = data.get("kind", "styles")
            action = data.get("action", "list")
            names = data.get("names", [])
            if isinstance(names, str):
                names = [names]
            current = _load_favorites(kind)
            if action == "add":
                current = _merge_unique_lists(current, names)
            elif action == "remove":
                remove_full = {str(x or "").strip() for x in names}
                remove_clean = {_strip_number(x).lower() for x in remove_full}
                current = [x for x in current if x not in remove_full and _strip_number(x).lower() not in remove_clean]
            elif action == "clear":
                current = []
            _save_favorites(kind, current)
            return web.json_response({"ok": True, "kind": kind, "favorites": current})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)
except Exception:
    pass
