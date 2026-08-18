# NovoLoko v4.6.7

NovoLoko v4.6.7 is a focused compatibility patch for Prompt Stack AIO Pro and MiniMax Music 3. It preserves the current Music Lab workflow layout, node IDs, graph links, serialized widget order, recipe v2, external Seed Lab wiring, and Clone/Like stored values.

## Prompt Stack AIO Pro

- Replaced two competing panel-height systems with one renderer-aware sizing contract in the main Prompt Stack frontend.
- Keeps the DOM slot browser and every native control inside the node in Classic and Nodes 2.0.
- Reapplies containment after configure, tab remount, graph reload, renderer changes, and offscreen return.
- Preserves manual resize and the 450 / 520 / 600 panel presets without skyscraper growth.

## MiniMax Music 3 Controls

- SONG IDEA now commits immediately to its canonical serialized widget and mirrored property, and the latest value wins across configure, graph-configured, tab remount, save, and reload.
- Preset/reference selection never replaces a user-edited idea. Explicit Load Track Recipe still restores the saved idea by design.
- Added 192 curated, artist-neutral ideas across 16 categories, with category, search, picker, and Random Idea controls. Random Idea affects only the idea text, never the 19 music controls.
- Artist Strong/Loose references now show the actual effective Reference DNA while the 19 visible controls remain honest manual overrides.
- A matching manual choice is labeled MANUAL OVERRIDE with its value; other Reference DNA remains visible and active.
- Changing preset/reference clears stale Load Track Recipe status.

## Audio Library and player

- The selected track now shows its saved generating preset/reference, generation seed, and target duration when recorded in matched JSON or TXT metadata.
- Stored Clone/Like metadata is displayed as Strong/Loose reference without changing serialized compatibility values.
- Random resolved presets, custom controls, and legacy tracks are handled explicitly.
- Reverified separate persisted Auto-play new and Play next automatically settings, default-off auto-next, Repeat behavior, manual Next, and no restart when settings change.

## Install-folder safety

- Official release packaging now fails unless the ZIP contains exactly one top-level `ComfyUI-NovoLoko` folder with `__init__.py` directly inside it.
- The guard rejects GitHub source-archive folders such as `NovoLoko-main`.
- A manually downloaded GitHub branch/source ZIP may still be named `NovoLoko-main`; that is GitHub's source-archive convention, not the official NovoLoko release layout.

## Compatibility and limits

- No workflow JSON was rearranged or replaced in this patch.
- Artist references are descriptive, artist-neutral musical steering. Fidelity remains limited by the downstream music model and is not a guaranteed clone.
- Close ComfyUI before updating, restart it fully, and use Ctrl+F5 once if an old frontend bundle remains cached.
