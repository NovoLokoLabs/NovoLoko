#!/usr/bin/env python3
"""Migrate an older Nova/NovoLoko ComfyUI workflow to the clean current aliases."""
from __future__ import annotations
import json
import sys
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


def _update_known_string(value: str, field: str | None = None) -> str:
    """Migrate known serialized identifiers without rewriting user prompt text."""
    text = value
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

def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: migrate_workflow_to_novoloko.py workflow.json [output.json]")
    source = Path(sys.argv[1])
    target = Path(sys.argv[2]) if len(sys.argv) > 2 else source.with_name(source.stem + " - NovoLoko.json")
    data = json.loads(source.read_text(encoding="utf-8"))
    target.write_text(json.dumps(update(data), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(target)

if __name__ == "__main__":
    main()
