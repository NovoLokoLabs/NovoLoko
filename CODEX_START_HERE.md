# Start Here — NovoLoko Project

This repository contains the complete **ComfyUI-NovoLoko v3.4.0** custom-node package.

## Project goal

Make large ComfyUI workflows easier to build, understand, reproduce, compare, narrate, and save without turning the node graph into spaghetti.

## Current release priorities

1. Stability in current ComfyUI Desktop and portable builds.
2. One current menu entry per node.
3. Backward compatibility for current workflows through stable internal `Nova...` type IDs.
4. Clear NovoLoko branding in every visible label.
5. Repeatable seeded Prompt Stack and Prompt Enhancer output.
6. Optional voice features that never prevent the core package from loading.

## Layout

- `nodes.py` — CSV/style/character loaders, prompt tools, overlay and logging.
- `aio_prompt_stack.py` — Prompt Stack AIO Pro.
- `nova_core_nodes.py` — enhancer, seed lab, timer, previews, text display, memory manager and concatenate.
- `nova_workflow.py` — prompt styling, source switching and metadata workflow nodes.
- `nova_compare.py` — Compare Studio backend.
- `voice_nodes.py` — speech-to-text, Kokoro TTS and Media Studio backend.
- `web/` — ComfyUI frontend extensions.
- `csv/` and `styles/` — included prompt libraries.
- `workflows/` — current example workflows.
- `tools/migrate_workflow_to_novoloko.py` — migration helper for older workflow JSON files.
- `tools/validate_project.py` — repository validation.

## First Codex task

Audit the project without changing working behavior. Run the validator, identify high-confidence defects or stale visible branding, and propose a small first pull request. Do not rename internal node IDs merely to match the product name.

## Live testing checklist

Static checks cannot replace a real ComfyUI launch. A release candidate should also be tested for:

- clean startup with only `ComfyUI-NovoLoko` installed;
- all 32 nodes appearing once under the NovoLoko menus;
- current AIO workflow loading without missing nodes or shifted links;
- Prompt Enhancer fixed-seed repeatability;
- CSV/YAML dropdown refresh and favourites;
- Compare Studio image persistence and controls;
- Media Studio history and image output;
- optional voice package absent and present;
- browser hard refresh after frontend changes.
