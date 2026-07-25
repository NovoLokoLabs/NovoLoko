from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import nodes  # noqa: E402
from style_previews import preview_path, resize_and_store_preview  # noqa: E402


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def normalized_name(value: str) -> str:
    clean = nodes._strip_number(str(value or ""))
    return "".join(character for character in clean.casefold() if character.isalnum())


def previewable_record(record: dict) -> bool:
    name = str(record.get("name") or "").strip()
    if not name or nodes._is_no_style_name(name):
        return False
    clean = nodes._strip_number(name).strip().casefold()
    leaf = re.split(r"[|/]", clean)[-1].strip()
    return leaf not in {"none", "random", "off", "no style", "no character"}


def image_files(folder: Path) -> list[Path]:
    return sorted(
        (
            path
            for path in folder.rglob("*")
            if path.is_file() and path.suffix.casefold() in IMAGE_EXTENSIONS
        ),
        key=lambda path: path.as_posix().casefold(),
    )


def build_name_matches(records: list[dict], images: list[Path]) -> tuple[list[tuple[dict, Path]], list[Path]]:
    by_full: dict[str, list[dict]] = {}
    by_clean: dict[str, list[dict]] = {}
    for record in records:
        name = str(record.get("name") or "").strip()
        if not previewable_record(record):
            continue
        by_full.setdefault(normalized_name(name), []).append(record)
        by_clean.setdefault(normalized_name(nodes._strip_number(name)), []).append(record)

    matches: list[tuple[dict, Path]] = []
    unmatched: list[Path] = []
    used_names: set[str] = set()
    for image in images:
        key = normalized_name(image.stem)
        candidates = by_full.get(key) or by_clean.get(key) or []
        candidates = [
            record for record in candidates
            if str(record.get("name") or "") not in used_names
        ]
        if len(candidates) != 1:
            unmatched.append(image)
            continue
        record = candidates[0]
        used_names.add(str(record.get("name") or ""))
        matches.append((record, image))
    return matches, unmatched


def build_order_matches(records: list[dict], images: list[Path]) -> tuple[list[tuple[dict, Path]], list[Path]]:
    usable = [
        record for record in records
        if previewable_record(record)
    ]
    count = min(len(usable), len(images))
    return list(zip(usable[:count], images[:count])), images[count:]


def populate(
    image_folder: Path,
    library: str,
    size: int,
    mode: str,
    replace: bool,
) -> dict:
    resolved_library = Path(nodes._resolve_csv_path(library))
    records = nodes._read_styles(library)
    images = image_files(image_folder)
    matches, unmatched = (
        build_order_matches(records, images)
        if mode == "order"
        else build_name_matches(records, images)
    )

    imported = 0
    existing = 0
    failures = []
    for record, image in matches:
        name = str(record.get("name") or "")
        destination = preview_path(ROOT, resolved_library, name)
        if destination.exists() and not replace:
            existing += 1
            continue
        try:
            resize_and_store_preview(image, destination, size)
            imported += 1
        except Exception as error:
            failures.append({"image": image.name, "style": nodes._strip_number(name), "error": str(error)})

    return {
        "library": resolved_library.name,
        "size": size,
        "mode": mode,
        "image_count": len(images),
        "matched_count": len(matches),
        "imported_count": imported,
        "existing_count": existing,
        "unmatched_count": len(unmatched),
        "unmatched_images": [path.name for path in unmatched[:40]],
        "failures": failures[:40],
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Populate NovoLoko's local visual style preview library from a folder of images."
    )
    parser.add_argument("--images", required=True, type=Path, help="Folder containing PNG, JPEG, or WebP files.")
    parser.add_argument(
        "--library",
        default="styles/novoloko_all_yaml_styles.yaml",
        help="NovoLoko CSV/YAML style library path.",
    )
    parser.add_argument("--size", required=True, type=int, choices=(512, 1024))
    parser.add_argument(
        "--mode",
        choices=("name", "order"),
        default="name",
        help="Match filenames to style names, or pair sorted images with library order.",
    )
    parser.add_argument("--replace", action="store_true", help="Replace previews that already exist.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    image_folder = args.images.expanduser().resolve()
    if not image_folder.is_dir():
        raise SystemExit(f"Image folder does not exist: {image_folder}")

    result = populate(
        image_folder,
        args.library,
        args.size,
        args.mode,
        args.replace,
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))
    if result["failures"]:
        return 2
    if result["matched_count"] == 0:
        print(
            "\nNo images matched. Rename images to their style names or rerun in ordered mode.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
