# NovoLoko v3.6.0

This release turns the visual browser into a reusable, private local preview
library without changing any serialized node contract.

## Added

- Real user-supplied preview images on visual style cards.
- Add, replace and remove controls for PNG, JPEG and WebP images.
- Exact 512x512 or 1024x1024 centre-cropped WebP storage.
- A standalone **Styles** launcher that works without adding a loader node.
- The same visual browser inside Prompt Stack's Medium controls.
- `POPULATE_STYLE_PREVIEWS.bat` for importing an image folder by matching style
  names or sorted library order.

## Privacy and storage

- Previews remain under `data/style_previews/`.
- Browser responses contain opaque identifiers rather than filesystem paths.
- Generated previews are ignored by Git and excluded from release packages.
- Updater overlay installation leaves existing local previews in place.

## Compatibility

All 33 node IDs, inputs, outputs, socket order, widget order and v3.5.0 workflow links are unchanged.

## Upgrade

Run the NovoLokoLabs updater, restart ComfyUI completely, then press `Ctrl+F5`.
See `STYLE_PREVIEWS.md` for individual and batch image instructions.
