# ComfyUI-NovoLoko v3.3.0

NovoLoko is a unified ComfyUI custom-node suite for prompt building, CSV/YAML libraries, prompt enhancement, seed history, previews, metadata saving, comparison, media history, voice tools and memory cleanup.

## Install

1. Close ComfyUI completely.
2. Delete or rename any active `ComfyUI-NovaNodes`, `ComfyUI-NovaNodesOriginal`, `ComfyUI-Nova-Essentials-main` and `ComfyUI-Nova-Voice` folders.
3. Copy `ComfyUI-NovoLoko` into `ComfyUI/custom_nodes/`.
4. Restart ComfyUI and press `Ctrl+F5` in the browser.
5. Load `workflows/NovoLoko AIO v3.3.0 - Latest Workflow.json`.

Only one NovoLoko package should be active. Running old Nova packages beside this one can create duplicate node registrations and frontend conflicts.

## Clean release

This build exposes one current menu entry for each node. Superseded aliases such as Prompt Stack V1/V2/V3, CSV Loader V8–V12, Character Loader V1–V4 and old Compare/Overlay duplicates are no longer registered.

Internal `Nova...` class IDs are retained where useful so existing current workflows remain compatible; all visible branding, categories, documentation, workflows and libraries use NovoLoko.

For an older workflow that still uses versioned aliases, drag its JSON file onto `MIGRATE_OLD_WORKFLOW_TO_NOVOLOKO.bat`.

## Included workflows

- `NovoLoko AIO v3.3.0 - Latest Workflow.json` — full prompt stack, enhancer instructions and status displays, two-pass generation, compare, metadata save, media studio, timer and memory manager.
- `NovoLoko Compare Studio v3.3.0.json` — minimal image comparison example.

## Main nodes

Prompt tools include Prompt Stack AIO Pro, Prompt Enhancer Pro, Manual Prompt + YAML Styler, source selector, CSV style/character loaders, prompt switches, Text Prompt and Text Display.

Image and utility tools include Preview Pass Through, Save Image Metadata, Image / Compare Studio, Seed Lab, Generation Timer, Memory Manager, Overlay Text Pro and Prompt Logger.

Optional media tools include Voice Prompt, Kokoro TTS, OmniLoko TTS, Autoplay Trigger, Media Studio and Kokoro Text Bridge.

## CSV and YAML library

All supplied libraries are organized under `csv/` and `styles/`. The release removes exact duplicates, obsolete character exports, old pose revisions and superseded 4,000/5,400-entry mega mixes. The current 9,000-entry mega mix remains.

The latest workflow uses:

- `styles/novoloko_all_yaml_styles.yaml`
- `csv/poses/novoloko_pose_collection_485.csv`
- `csv/actions/novoloko_actions_1000.csv`
- `csv/clothing/novoloko_clothing_hair_expanded_4000.csv`
- `csv/locations/novoloko_locations_expanded_3000.csv`
- `csv/characters/novoloko_characters_master_1098.csv`

## Repeatable Prompt Enhancer output

Use a fixed seed in NovoLoko Seed Lab and `Random From Seed` in Prompt Stack AIO. The idea, selected stack entries and enhancer seed must all stay unchanged. For guaranteed word-for-word output across a very large batch, generate once and use the enhanced text as a manual prompt for the remaining queues.

## Optional Kokoro and Whisper dependencies

Run `INSTALL_NOVOLOKO_VOICE_AND_KOKORO.bat` only when Whisper/Kokoro imports are missing; it installs the separate optional `requirements-voice.txt`. Existing voice installations normally do not need reinstalling.

## OmniLoko TTS through LokoBridge

NovoLoko OmniLoko TTS uses the separately running OmniLoko desktop app through the local-only LokoBridge service. The ComfyUI node does not load another OmniVoice model or start its own voice worker.

ComfyUI Manager and normal runtime dependency installation install `lokobridge-client==1.0.0` automatically on Python 3.11 or later. Older Python installations remain import-safe, but OmniLoko TTS reports that the client is unavailable. Manual ZIP installations can install the client with:

```powershell
python -m pip install lokobridge-client==1.0.0
```

Run that command with ComfyUI's own Python executable, not an unrelated system Python. Start OmniLoko normally or with `--bridge-only` before generating. The node supports both **Current OmniLoko Profile** and saved OmniLoko presets.

## Troubleshooting

- Missing nodes: confirm the folder is exactly `ComfyUI/custom_nodes/ComfyUI-NovoLoko/` and contains `__init__.py` directly.
- Duplicate nodes or odd frontend behaviour: remove old Nova packages and restart fully.
- Stale menus: press `Ctrl+F5` after restarting.
- Voice import problems: run the installer, then `DIAGNOSE_NOVOLOKO_INSTALL.bat`.
- Old workflow aliases: use the included migration batch file.

## Licence

NovoLoko is source-visible proprietary software distributed under the
NovoLoko Limited Use Licence. Unmodified copies may be downloaded,
installed, and used as described in `LICENSE`. Modification,
redistribution, repackaging, sublicensing, and sale are not permitted
without prior written authorization from NovoLokoLabs.
