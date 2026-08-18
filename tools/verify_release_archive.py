"""Fail closed if a NovoLoko release ZIP could install under the wrong folder."""

from __future__ import annotations

import argparse
from pathlib import PurePosixPath
import zipfile


EXPECTED_ROOT = "ComfyUI-NovoLoko"


def verify_archive(path: str) -> tuple[int, str]:
    with zipfile.ZipFile(path) as archive:
        files = [name.replace("\\", "/") for name in archive.namelist() if not name.endswith("/")]
    if not files:
        raise ValueError("release ZIP is empty")
    roots: set[str] = set()
    for name in files:
        pure = PurePosixPath(name)
        if pure.is_absolute() or ".." in pure.parts or not pure.parts:
            raise ValueError(f"unsafe archive member: {name}")
        roots.add(pure.parts[0])
    if roots != {EXPECTED_ROOT}:
        raise ValueError(
            f"release ZIP must contain only top-level {EXPECTED_ROOT!r}; found {sorted(roots)!r}"
        )
    if f"{EXPECTED_ROOT}/__init__.py" not in files:
        raise ValueError(f"{EXPECTED_ROOT}/__init__.py must be directly inside the release ZIP")
    if any(part.casefold() == "novoloko-main" for name in files for part in PurePosixPath(name).parts):
        raise ValueError("release ZIP must never contain a NovoLoko-main folder")
    return len(files), EXPECTED_ROOT


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive")
    args = parser.parse_args()
    count, root = verify_archive(args.archive)
    print(f"Release archive verified: {count} files under {root}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
