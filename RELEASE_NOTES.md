# NovoLoko v3.7.0

This release adds native workflow controls and completes the visual-library and
OmniLoko auto-start workflow.

## New

- **NovoLoko Control Panel** provides TTS and Prompt Enhancer On/Off outputs.
- The standalone **Styles** button includes an installed CSV/YAML library
  selector and remembers the selected file.
- Visual style pages can show 4, 9, 24 or 50 cards.
- Seed Lab exposes a prominent **Manual Random Seed** action alongside its
  random-every-queue, fixed, after-run and recent-history features.

## Fixed

- Preview images fill square cards; double-click opens the large uncropped
  viewer instead of generating.
- Right-click exits the current viewer screen consistently.
- Closing the style browser stops the preview generation it owns.
- Saved OmniLoko presets no longer fail ComfyUI validation while OmniLoko is
  offline. Disabled and Off modes remain silent; enabled OmniLoko speech can
  auto-start the canonical app and then resolve the saved preset.

## Compatibility

All 33 existing node IDs, inputs, outputs, socket order, widget order and v3.5.0
workflow links are unchanged. One optional node was added, for 34 total.

## Upgrade

Run the NovoLokoLabs updater, restart ComfyUI completely, then press `Ctrl+F5`.
