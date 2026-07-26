#!/usr/bin/env python3
"""Migrate an older Nova/NovoLoko ComfyUI workflow to the clean current aliases."""
from __future__ import annotations
import argparse
import json
from pathlib import Path

TYPE_MAP = {
    "LoadStylesCSVPro": "NovaLoadStylesCSVPro",
    "NovaLoadStylesCSVProV8": "NovaLoadStylesCSVPro",
    "NovaLoadStylesCSVProV9": "NovaLoadStylesCSVPro",
    "NovaLoadStylesCSVProV10": "NovaLoadStylesCSVPro",
    "NovaLoadStylesCSVProV11": "NovaLoadStylesCSVPro",
    "NovaLoadStylesCSVProV12": "NovaLoadStylesCSVPro",
    "NovaLoadCharactersCSVProV1": "NovaLoadCharactersCSVPro",
    "NovaLoadCharactersCSVProV2": "NovaLoadCharactersCSVPro",
    "NovaLoadCharactersCSVProV3": "NovaLoadCharactersCSVPro",
    "NovaLoadCharactersCSVProV4": "NovaLoadCharactersCSVPro",
    "NovaPromptStyleSwitchV3": "NovaPromptStyleSwitch",
    "NovaPromptStyleCharacterSwitchV4": "NovaPromptStyleCharacterSwitch",
    "NovaPromptStyleCharacterSwitchV5": "NovaPromptStyleCharacterSwitch",
    "NovaPromptTwoStyleCharacterSwitchV1": "NovaPromptTwoStyleCharacterSwitch",
    "NovaPromptTwoStyleCharacterPreEnhanceV1": "NovaPromptBuilderPreEnhance",
    "NovaOverlayText": "NovaOverlayTextPro",
    "NovaImageCompare": "NovaImageComparePro",
    "NovaPromptStackAIOV1": "NovaPromptStackAIO",
    "NovaPromptStackAIOV2": "NovaPromptStackAIO",
    "NovaPromptStackAIOV3": "NovaPromptStackAIO",
}
PATH_MAP = {'styles_krea2_mega_plus_v6_literal_triggers.csv': 'csv/styles/novoloko_krea2_styles_1455.csv', 'characters_krea2_nova_v3_expanded_real_female.csv': 'csv/characters/novoloko_characters_master_1098.csv', 'characters_real_female_fixed.csv': 'csv/characters/novoloko_characters_master_1098.csv', 'Characters_Master_Uncensored.csv': 'csv/characters/novoloko_characters_master_1098.csv', 'xxxxpose.csv': 'csv/poses/novoloko_pose_collection_485.csv', 'csv/actions/nova_actions_1000.csv': 'csv/actions/novoloko_actions_1000.csv', 'csv/clothing/nova_branded_clothing_1000.csv': 'csv/clothing/novoloko_branded_clothing_1000.csv', 'csv/clothing/nova_branded_clothing_gendered_2400.csv': 'csv/clothing/novoloko_branded_clothing_gendered_2400.csv', 'csv/clothing/nova_clothing_hair_expanded_4000.csv': 'csv/clothing/novoloko_clothing_hair_expanded_4000.csv', 'csv/locations/nova_locations_expanded_3000.csv': 'csv/locations/novoloko_locations_expanded_3000.csv', 'csv/locations/nova_real_locations_1000.csv': 'csv/locations/novoloko_real_locations_1000.csv', 'csv/mega/nova_mega_mix_4000.csv': 'csv/mega/novoloko_mega_mix_9000.csv', 'csv/mega/nova_mega_mix_5400.csv': 'csv/mega/novoloko_mega_mix_9000.csv', 'csv/mega/nova_mega_mix_9000.csv': 'csv/mega/novoloko_mega_mix_9000.csv', 'csv/poses/nova_poses_1000.csv': 'csv/poses/novoloko_poses_1000.csv', 'styles/nova_all_yaml_styles.yaml': 'styles/novoloko_all_yaml_styles.yaml'}

VISIBLE_BRAND_FIELDS = {"title"}
MOJIBAKE_MARKERS = ("Ã", "Â", "â€", "â‚", "ðŸ")


def _windows_1252_bytes(value: str) -> bytes | None:
    """Reverse one accidental Windows-1252/Latin-1 decode without data loss."""
    reverse = {}
    for number in range(256):
        raw = bytes([number])
        try:
            reverse[raw.decode("cp1252")] = number
        except UnicodeDecodeError:
            pass
        reverse.setdefault(chr(number), number)
    output = bytearray()
    for character in value:
        number = reverse.get(character)
        if number is None:
            return None
        output.append(number)
    return bytes(output)


def _mojibake_score(value: str) -> int:
    return sum(value.count(marker) for marker in MOJIBAKE_MARKERS) + sum(
        1 for character in value if 0x80 <= ord(character) <= 0x9F
    )


def repair_mojibake_text(value: str) -> str:
    """Repair repeated UTF-8-as-Windows-1252 corruption when it is unambiguous."""
    text = value
    if not any(marker in text for marker in MOJIBAKE_MARKERS):
        return text
    for _ in range(3):
        raw = _windows_1252_bytes(text)
        if raw is None:
            break
        try:
            repaired = raw.decode("utf-8")
        except UnicodeDecodeError:
            break
        if _mojibake_score(repaired) >= _mojibake_score(text):
            break
        text = repaired
    return text


def _update_known_string(value: str, field: str | None = None) -> str:
    """Migrate known serialized identifiers without rewriting user prompt text."""
    text = repair_mojibake_text(value)
    for old, new in PATH_MAP.items():
        text = text.replace(old, new)
    text = text.replace("ComfyUI-NovaNodes", "ComfyUI-NovoLoko")
    text = text.replace("NovaVoiceKokoro", "NovoLokoVoiceKokoro")
    text = text.replace("NovaPreview/", "NovoLokoPreview/")
    if field in VISIBLE_BRAND_FIELDS:
        text = text.replace("Nova Nodes", "NovoLoko").replace("NovaNodes", "NovoLoko")
        text = text.replace("NOVA ", "NOVOLOKO ").replace("Nova ", "NovoLoko ")
    return text


def update(value, field: str | None = None):
    if isinstance(value, dict):
        out = {key: update(item, key) for key, item in value.items()}
        if isinstance(out.get("type"), str):
            out["type"] = TYPE_MAP.get(out["type"], out["type"])
            if out["type"] == "NovaImageComparePro":
                for colour_field in ("color", "bgcolor", "boxcolor"):
                    out.pop(colour_field, None)
        props = out.get("properties")
        if isinstance(props, dict):
            if props.get("cnr_id") == "ComfyUI-NovaNodes":
                props["cnr_id"] = "ComfyUI-NovoLoko"
            if isinstance(props.get("Node name for S&R"), str):
                props["Node name for S&R"] = TYPE_MAP.get(props["Node name for S&R"], props["Node name for S&R"])
        return out
    if isinstance(value, list):
        return [update(item, field) for item in value]
    if isinstance(value, str):
        return _update_known_string(value, field)
    return value


def clean_release_runtime_state(workflow):
    """Remove per-user preview/timing/seed state from an official workflow copy."""
    if not isinstance(workflow, dict):
        return workflow
    for node in workflow.get("nodes", []):
        if not isinstance(node, dict):
            continue
        properties = node.get("properties")
        if not isinstance(properties, dict):
            continue
        node_type = str(node.get("type") or "")
        if node_type == "NovaImageComparePro":
            properties.pop("novaCompareImageRefs", None)
            properties.pop("novaCompareInfo", None)
        elif node_type == "NovaGenerationTimer":
            properties.pop("novaTimerLastMs", None)
            properties.pop("novaTimerOutcome", None)
            properties.pop("novaTimerHistory", None)
        elif node_type == "NovaSeedLab":
            properties.pop("novaLastSeed", None)
            properties.pop("novaSeedHistory", None)
            properties.pop("novaSelectedSeed", None)
        elif node_type == "NovaVoiceEngineTTS":
            values = node.get("widgets_values")
            if isinstance(values, list) and len(values) > 3:
                values[3] = "Current OmniLoko Profile"
    definitions = workflow.get("definitions")
    if isinstance(definitions, dict):
        for subgraph in definitions.get("subgraphs", []):
            clean_release_runtime_state(subgraph)
    return workflow


def main():
    parser = argparse.ArgumentParser(
        description="Migrate a workflow while preserving serialized contracts."
    )
    parser.add_argument("workflow")
    parser.add_argument("output", nargs="?")
    parser.add_argument(
        "--clean-runtime-state",
        action="store_true",
        help="Remove saved Compare images plus timer and seed history from a release copy.",
    )
    args = parser.parse_args()
    source = Path(args.workflow)
    target = Path(args.output) if args.output else source.with_name(source.stem + " - NovoLoko.json")
    data = json.loads(source.read_text(encoding="utf-8"))
    migrated = update(data)
    if args.clean_runtime_state:
        migrated = clean_release_runtime_state(migrated)
    target.write_text(json.dumps(migrated, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(target)

if __name__ == "__main__":
    main()
