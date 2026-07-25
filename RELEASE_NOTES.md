# NovoLoko v3.5.2

This polish release improves gallery-like style browsing and workflow layout without changing any serialized node contract.

## Added

- Full-screen visual style library for the existing CSV Style Loader.
- Search across style names and prompt text, category filtering, favourites, recent history, random selection, grid/list views, prompt details and pagination.

## Fixed

- Prompt Stack AIO now restores the exact width and height saved by ComfyUI.
- Memory Manager remains compact after ComfyUI recalculates widget widths.
- OmniLoko opens automatically for real OmniLoko voice jobs only; Kokoro and Off mode never launch it.

## Compatibility

All 33 node IDs, inputs, outputs, socket order, widget order and v3.5.0 workflow links are unchanged.

## Upgrade

Run the NovoLokoLabs updater, restart ComfyUI completely, then press `Ctrl+F5` in the browser.
