# NovoLoko v3.6.2

This patch adds a large, uncropped viewer for stored visual-style previews.

## Improved

- Adds **View larger** to cards that have a real stored preview.
- Opens previews in a full-screen fit-to-window viewer.
- Adds an actual-size mode for inspecting the stored 512 or 1024 image.
- Supports Escape, click-outside and an explicit Close button.
- Keeps generate-and-save, manual upload, batch import and card selection
  behavior unchanged.

## Compatibility

All 33 node IDs, inputs, outputs, socket order, widget order and v3.5.0 workflow
links are unchanged.

## Upgrade

Run the NovoLokoLabs updater, restart ComfyUI completely, then press `Ctrl+F5`.
