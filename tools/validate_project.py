#!/usr/bin/env python3
"""Static validation for the NovoLoko ComfyUI custom-node repository."""

from __future__ import annotations

import ast
import csv
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "NovoLoko_v3.2.7_manifest.json"
PYTHON_FILES = sorted(p for p in ROOT.rglob("*.py") if "__pycache__" not in p.parts)
JAVASCRIPT_FILES = sorted(ROOT.joinpath("web").rglob("*.js"))
WORKFLOW_FILES = sorted(ROOT.joinpath("workflows").glob("*.json"))


@dataclass
class Result:
    errors: list[str]
    warnings: list[str]

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def parse_python(result: Result) -> dict[Path, ast.AST]:
    trees: dict[Path, ast.AST] = {}
    for path in PYTHON_FILES:
        try:
            trees[path] = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except (OSError, UnicodeError, SyntaxError) as exc:
            result.error(f"Python parse failed: {rel(path)}: {exc}")
    return trees


def literal_dict_assignment(tree: ast.AST, name: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        if not any(isinstance(target, ast.Name) and target.id == name for target in node.targets):
            continue
        if not isinstance(node.value, ast.Dict):
            continue
        for key_node, value_node in zip(node.value.keys, node.value.values):
            if not isinstance(key_node, ast.Constant) or not isinstance(key_node.value, str):
                continue
            if isinstance(value_node, ast.Constant) and isinstance(value_node.value, str):
                found[key_node.value] = value_node.value
            elif isinstance(value_node, ast.Name):
                found[key_node.value] = value_node.id
            elif isinstance(value_node, ast.Attribute):
                found[key_node.value] = value_node.attr
            else:
                found[key_node.value] = ast.dump(value_node, include_attributes=False)
    return found


def validate_mappings(result: Result, trees: dict[Path, ast.AST], manifest: dict) -> None:
    class_occurrences: dict[str, list[str]] = {}
    displays: dict[str, str] = {}

    for path, tree in trees.items():
        class_map = literal_dict_assignment(tree, "NODE_CLASS_MAPPINGS")
        display_map = literal_dict_assignment(tree, "NODE_DISPLAY_NAME_MAPPINGS")
        for key in class_map:
            class_occurrences.setdefault(key, []).append(rel(path))
        for key, value in display_map.items():
            if key in displays and displays[key] != value:
                result.error(f"Conflicting display names for {key!r}: {displays[key]!r} vs {value!r}")
            displays[key] = value

    duplicates = {key: paths for key, paths in class_occurrences.items() if len(paths) > 1}
    for key, paths in sorted(duplicates.items()):
        result.error(f"Duplicate registered node ID {key!r} in: {', '.join(paths)}")

    registered = set(class_occurrences)
    expected = set(manifest.get("registered_nodes", []))
    if registered != expected:
        missing = sorted(expected - registered)
        extra = sorted(registered - expected)
        if missing:
            result.error(f"Manifest nodes missing from code: {missing}")
        if extra:
            result.error(f"Code nodes missing from manifest: {extra}")

    expected_count = manifest.get("registered_node_count")
    if expected_count != len(registered):
        result.error(f"Manifest node count is {expected_count}, code contains {len(registered)} unique mappings")

    if set(displays) != registered:
        missing_display = sorted(registered - set(displays))
        extra_display = sorted(set(displays) - registered)
        if missing_display:
            result.error(f"Registered nodes without display names: {missing_display}")
        if extra_display:
            result.error(f"Display names without registered nodes: {extra_display}")

    for key, display in sorted(displays.items()):
        if not display.startswith("NovoLoko"):
            result.error(f"Visible display name for {key!r} is not NovoLoko branded: {display!r}")


def validate_version(result: Result, trees: dict[Path, ast.AST], manifest: dict) -> None:
    expected = str(manifest.get("version", "")).strip()
    versions: dict[str, str] = {}
    version_names = {"NOVA_VERSION", "NOVA_VOICE_VERSION", "NOVA_CORE_VERSION"}
    for path, tree in trees.items():
        for node in ast.walk(tree):
            if not isinstance(node, ast.Assign) or not isinstance(node.value, ast.Constant):
                continue
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in version_names and isinstance(node.value.value, str):
                    versions[f"{rel(path)}:{target.id}"] = node.value.value
    for source, version in sorted(versions.items()):
        if version != expected:
            result.error(f"Version mismatch: {source}={version!r}, manifest={expected!r}")
    if not versions:
        result.error("No package version constants found")


def validate_javascript(result: Result) -> None:
    node = shutil.which("node")
    if not node:
        result.warn("Node.js not found; skipped JavaScript syntax checks")
        return
    for path in JAVASCRIPT_FILES:
        try:
            source = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            result.error(f"JavaScript read failed: {rel(path)}: {exc}")
            continue
        # ComfyUI frontend extensions are browser ES modules. Passing the source
        # on stdin lets Node parse it as a module without adding package.json or
        # renaming release files to .mjs.
        proc = subprocess.run(
            [node, "--input-type=module", "--check"],
            input=source,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        if proc.returncode:
            message = (proc.stderr or proc.stdout).strip()
            result.error(f"JavaScript syntax failed: {rel(path)}: {message}")


def validate_json(result: Result) -> dict[Path, object]:
    parsed: dict[Path, object] = {}
    for path in sorted(ROOT.rglob("*.json")):
        if any(part in {".git", "__pycache__"} for part in path.parts):
            continue
        try:
            parsed[path] = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            result.error(f"JSON parse failed: {rel(path)}: {exc}")
    return parsed


def validate_workflow_links(result: Result, parsed: dict[Path, object]) -> None:
    for path in WORKFLOW_FILES:
        workflow = parsed.get(path)
        if not isinstance(workflow, dict):
            result.error(f"Workflow is not a JSON object: {rel(path)}")
            continue
        nodes = workflow.get("nodes", [])
        links = workflow.get("links", [])
        if not isinstance(nodes, list) or not isinstance(links, list):
            result.error(f"Workflow nodes/links malformed: {rel(path)}")
            continue
        node_ids = {node.get("id") for node in nodes if isinstance(node, dict)}
        if None in node_ids:
            result.error(f"Workflow contains node without ID: {rel(path)}")
        link_ids: set[object] = set()
        for link in links:
            if not isinstance(link, list) or len(link) < 5:
                result.error(f"Malformed link in {rel(path)}: {link!r}")
                continue
            link_id, source_id, _source_slot, target_id, _target_slot = link[:5]
            if link_id in link_ids:
                result.error(f"Duplicate link ID {link_id!r} in {rel(path)}")
            link_ids.add(link_id)
            if source_id not in node_ids:
                result.error(f"Link {link_id!r} has missing source node {source_id!r} in {rel(path)}")
            if target_id not in node_ids:
                result.error(f"Link {link_id!r} has missing target node {target_id!r} in {rel(path)}")


def validate_manifest_paths(result: Result, manifest: dict) -> None:
    for workflow in manifest.get("workflows", []):
        path = ROOT / workflow
        if not path.is_file():
            result.error(f"Manifest workflow missing: {workflow}")


def validate_csv_files(result: Result) -> None:
    for path in sorted(ROOT.joinpath("csv").rglob("*.csv")):
        try:
            with path.open("r", encoding="utf-8-sig", newline="") as handle:
                reader = csv.reader(handle)
                for index, _row in enumerate(reader, start=1):
                    if index >= 5:
                        break
        except (OSError, UnicodeError, csv.Error) as exc:
            result.error(f"CSV read failed: {rel(path)}: {exc}")


def validate_yaml_files(result: Result) -> None:
    try:
        import yaml  # type: ignore
    except ImportError:
        result.warn("PyYAML not installed; skipped YAML parsing")
        return
    for path in sorted(ROOT.joinpath("styles").rglob("*.y*ml")):
        try:
            yaml.safe_load(path.read_text(encoding="utf-8"))
        except Exception as exc:  # PyYAML exposes several parser exception types.
            result.error(f"YAML parse failed: {rel(path)}: {exc}")


def validate_no_packaged_runtime_state(result: Result) -> None:
    state_files = [ROOT / "data/history.json"] + sorted(ROOT.glob("data/favorites_*.json"))
    for path in state_files:
        if not path.exists():
            continue
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            result.error(f"Runtime state file is invalid JSON: {rel(path)}: {exc}")
            continue
        if value not in ({}, [], None):
            result.error(f"Runtime state must be empty in releases: {rel(path)}")


def validate_absolute_windows_paths(result: Result) -> None:
    pattern = re.compile(r"(?i)(?:^|[\"'])\s*[a-z]:\\")
    allowed_suffixes = {".py", ".js", ".md", ".json", ".bat", ".txt", ".yaml", ".yml"}
    for path in sorted(p for p in ROOT.rglob("*") if p.is_file() and p.suffix.lower() in allowed_suffixes):
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError as exc:
            result.error(f"Could not read {rel(path)}: {exc}")
            continue
        for line_number, line in enumerate(text.splitlines(), start=1):
            if pattern.search(line):
                result.error(f"Possible absolute Windows path in {rel(path)}:{line_number}: {line.strip()[:140]}")


def main() -> int:
    result = Result(errors=[], warnings=[])
    try:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"ERROR: Cannot read manifest: {exc}")
        return 1

    trees = parse_python(result)
    parsed_json = validate_json(result)
    validate_mappings(result, trees, manifest)
    validate_version(result, trees, manifest)
    validate_javascript(result)
    validate_workflow_links(result, parsed_json)
    validate_manifest_paths(result, manifest)
    validate_csv_files(result)
    validate_yaml_files(result)
    validate_no_packaged_runtime_state(result)
    validate_absolute_windows_paths(result)

    for warning in result.warnings:
        print(f"WARNING: {warning}")
    for error in result.errors:
        print(f"ERROR: {error}")

    if result.errors:
        print(f"\nNovoLoko validation FAILED with {len(result.errors)} error(s) and {len(result.warnings)} warning(s).")
        return 1

    print(
        f"NovoLoko validation PASSED: {len(PYTHON_FILES)} Python files, "
        f"{len(JAVASCRIPT_FILES)} JavaScript files, {len(WORKFLOW_FILES)} workflows; "
        f"{len(result.warnings)} warning(s)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
