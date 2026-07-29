# NovoLoko v4.0.0

NovoLoko v4.0.0 is the complete workflow and dual-frontend update.

## New

- NovoLoko Power LoRA Stack with separate Model/CLIP strengths, row ordering,
  trigger words, random pools, presets, CivitAI search, model information and
  downloads.
- NovoLoko Group Controller with search, sorting, configurable group colors,
  enable/bypass, solo, navigation and random group selection.
- Resizable Workflow Banner and Workflow Cheat Sheet nodes with configurable
  fonts, colors and borders, clickable links, model folders and copy actions.
- The exact NovoLoko AIO v4.0.0 workflow supplied for this release.
- Expanded Global Variety CSV/YAML library pack.

## Improved

- Legacy LiteGraph and Nodes 2.0 parity for Timer, Text Display, Prompt
  Enhancer, Voice TTS, Compare Studio, Media Studio and presentation nodes.
- Prompt Stack subject controls appear beside Medium while preserving saved
  widget compatibility; all-names output includes the manual prompt.
- Media Studio supports configurable project folders and filename prefixes,
  shows the current saved seed and provides Copy seed.
- Text Display and Workflow Cheat Sheet context menus include Copy text and
  Copy selected text.
- Style launcher settings refresh immediately and preserve visibility, size
  and position.

Existing internal `Nova...` node type IDs and established serialization order
remain compatible. User-confirmed ComfyUI Desktop behavior covers both legacy
LiteGraph and Nodes 2.0.

Close and restart ComfyUI Desktop completely after installing the update so its
embedded frontend loads the v4.0.0 JavaScript files.
