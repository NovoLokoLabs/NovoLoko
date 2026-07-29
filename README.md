# ComfyUI-NovoLoko v4.0.0

NovoLoko is a unified ComfyUI custom-node suite for prompt building, CSV/YAML libraries, prompt enhancement, seed history, previews, metadata saving, comparison, media history, voice tools and memory cleanup.

## Install

1. Close ComfyUI completely.
2. Delete or rename any active `ComfyUI-NovaNodes`, `ComfyUI-NovaNodesOriginal`, `ComfyUI-Nova-Essentials-main` and `ComfyUI-Nova-Voice` folders.
3. Copy `ComfyUI-NovoLoko` into `ComfyUI/custom_nodes/`.
4. Restart ComfyUI Desktop completely.
5. Load `workflows/NovoLoko AIO v4.0.0.json`.

Only one NovoLoko package should be active. Running old Nova packages beside this one can create duplicate node registrations and frontend conflicts.

## Clean release

This build exposes one current menu entry for each node. Superseded aliases such as Prompt Stack V1/V2/V3, CSV Loader V8–V12, Character Loader V1–V4 and old Compare/Overlay duplicates are no longer registered.

Internal `Nova...` class IDs are retained where useful so existing current workflows remain compatible; all visible branding, categories, documentation, workflows and libraries use NovoLoko.

For an older workflow that still uses versioned aliases, drag its JSON file onto `MIGRATE_OLD_WORKFLOW_TO_NOVOLOKO.bat`.

## Included workflows

- `NovoLoko AIO v4.0.0.json` — the current complete workflow with the seven-slot prompt stack, Power LoRA Stack, Group Controller, presentation banner and cheat sheet, unified voice selector, enhancer, two-pass generation, Compare Studio, metadata, Media Studio, timer and memory tools.
- `NovoLoko Compare Studio v4.0.0.json` — minimal image comparison example with theme-aware node chrome.

The v4.0.0 frontend keeps legacy LiteGraph and Nodes 2.0 behavior aligned while
preserving serialized node IDs, sockets, widgets, links and prompt text.

## Main nodes

Prompt tools include Prompt Stack AIO Pro, Prompt Enhancer Pro, Manual Prompt + CSV/YAML Styler, source selector, CSV style/character loaders, prompt switches, Text Prompt and Text Display. The full-screen visual library includes search, categories, favourites, recent history, grid/list views, prompt details and pagination. It can be opened from Manual Prompt, the CSV Style Loader, Prompt Stack's Medium controls or the standalone **Styles** button.

Visual cards can use private local PNG, JPEG or WebP previews. Select a style and
choose **Add image...**, or drag a folder onto `POPULATE_STYLE_PREVIEWS.bat` to
populate the library at 512x512 or 1024x1024. Preview files remain under
`data/style_previews/`, are ignored by Git and are preserved by updater overlay
installs. See `STYLE_PREVIEWS.md`.
The browser remembers the last 512 or 1024 preview size and shows the stored
pixel size on the lower-right corner of every saved preview card.

Use **Generate + save preview** to apply the selected style to the current
Prompt Stack or Style Loader, queue the current workflow and automatically save
its final generated image onto that card. Real previews fill their square cards
edge-to-edge. **View larger** or a double-click opens the stored image uncropped in a full-screen viewer with
fit-to-window and actual-size modes. The floating **Styles** launcher can be
dragged anywhere, remembers its position and can switch among installed NovoLoko CSV/YAML libraries. Standalone mode now exposes an explicit workflow-target selector, so a different library can be assigned and generated without reopening the browser from a node.

`NovoLoko Control Panel` provides compact TTS and Prompt Enhancer On/Off outputs
for workflow-wide controls. `NovoLoko Seed Lab` includes a prominent manual
random-seed-and-run button, a separate Fixed Seed Run button, Fixed/Random Every
Queue modes, After-run behavior and its last 20 seeds without requiring a
separate seed extension. Seed Lab and Voice TTS explicitly serialize and restore
their last manual width and height after their delayed frontend controls load.

Browser pages offer 24, 50, 100 or All entries. Cards retain a readable square
size and the result area scrolls instead of shrinking large pages.

**Generate all missing** runs the current workflow sequentially for every style
in the selected CSV/YAML that does not have a preview. NovoLoko shows the exact
run count and a large-library warning first, preserves existing images, and
keeps running after the browser is closed. Reopen the browser to see the same
progress and **Stop generating** control, or use ComfyUI's normal Cancel action.
The browser also provides explicit refresh, persistent convenience options,
double-click large viewing, mouse 4/5 style navigation and a large viewer with
mouse-pointer-centred wheel zoom up to 32×, drag panning, Previous/Next,
**Generate new**, and right-click close.

Use **Open previews folder** to open managed preview storage in Windows Explorer.
**Change preview folder…** accepts another absolute folder or restores the
package default. The selection is local ignored runtime state; existing previews
are not moved automatically.

Image and utility tools include Preview Pass Through, Save Image Metadata, Image / Compare Studio, Seed Lab, Generation Timer, Memory Manager, Overlay Text Pro and Prompt Logger. Compare Studio keeps node and full-screen Guide/Line settings independent. The Line slider independently controls divider opacity, while Guide On/Off shows or hides only the circular drag handle. Split dragging remains active even when the handle or divider is hidden.

Power LoRA Stack supports independent Model/CLIP strengths, reorderable rows,
saved trigger words, random LoRA pools, presets, local metadata, CivitAI search,
model-page links and downloads. Group Controller provides searchable and
sortable group enable/bypass controls, solo/navigation actions, random group
selection and configurable group colors. Both nodes support legacy LiteGraph
and Nodes 2.0.

Workflow Banner and Workflow Cheat Sheet provide resizable presentation
surfaces with configurable fonts, colors, borders, clickable links, model
folders and right-click copy actions. The included v4.0.0 workflow uses them for
the NovoLoko banner, dependency list and workflow usage guide.

Generation Timer includes 498 organized WAV/MP3 completion sounds under
`data/NovoLokoTimerSounds/`. The timer scans every packaged subfolder and also
accepts user-added supported sounds there.

Optional media tools include Voice Prompt, the compact NovoLoko Voice TTS selector, individual Kokoro and OmniLoko TTS compatibility nodes, Autoplay Trigger, Media Studio and Kokoro Text Bridge.

## CSV and YAML library

All supplied libraries are organized under `csv/` and `styles/`. The v4.0.0
Global Variety Update includes 75 CSV files plus 31 YAML libraries. Superseded
exports were replaced by expanded current collections, including the 10,000
entry mega mix.

The included wildcard CSV/YAML pairs contain the latest user-revised prompt text
for the 397 uploaded medium styles and all eight focused style collections.

The latest workflow uses:

- `csv/wildcards/novoloko_uploaded_styles_master_397_FINAL.csv`
- `csv/subjects/novoloko_subjects_master_3600.csv`
- `csv/poses/novoloko_poses_1500.csv`
- `csv/actions/novoloko_actions_1500.csv`
- `csv/clothing/novoloko_clothing_hair_expanded_5800.csv`
- `csv/locations/novoloko_locations_expanded_global_3846.csv`
- `csv/characters/novoloko_characters_master_3200.csv`

Prompt Stack AIO now keeps Subject independent from Character and composes in this logical order: Medium, Subject, Pose, Action, Clothing, Location, Character, then Manual Prompt. Focused animal, real-car, fantasy and horror subject libraries are included alongside expanded automotive, animal, fantasy/horror action packs and a 1,500-entry variety location library.

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

Run that command with ComfyUI's own Python executable, not an unrelated system
Python. When an actual OmniLoko TTS job is queued, NovoLoko starts the installed
OmniLoko application hidden if its private bridge is not already running. After
the final active request, NovoLoko closes only the OmniLoko process it started;
an already-open user instance is left alone. Use **Open OmniLoko** on the node
when you want the app visible. Kokoro and Off mode never start OmniLoko;
voice-list and schema refreshes remain passive.

`NovoLoko Voice TTS` selects OmniLoko, Kokoro or Off without running the inactive backend and without cross-backend fallback. Advanced controls are hidden only in the frontend; all saved values remain serialized and the Python node works when frontend hiding is unavailable. **Refresh Voices** updates saved OmniLoko presets and packaged Kokoro voices in place without starting another worker. A removed preset stays visibly selected with a stale warning until you choose a replacement.

Media Studio **Revoice Current** generates a new audio/metadata entry through that same unified dispatcher while keeping the selected entry's prompt and exact stored image references. It does not queue image generation. **Delete Current** removes only managed audio/metadata and images no longer referenced by another entry.

Large Media Studio libraries are refreshed through the existing HTTP history route after generation finishes instead of being re-read inside the ComfyUI node execution. Full-resolution history images and the configured history limit remain unchanged.

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
