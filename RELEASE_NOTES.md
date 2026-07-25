# NovoLoko v3.6.2

This patch finishes the visual-preview workflow and OmniLoko auto-start lifecycle.

## Improved

- Adds **View larger** to cards that have a real stored preview.
- Opens previews in a full-screen fit-to-window viewer.
- Adds an actual-size mode for inspecting the stored 512 or 1024 image.
- Supports Escape, click-outside and an explicit Close button.
- Makes the floating **Styles** launcher reliable, draggable and position-aware.
- Adds **Generate all missing** for an entire CSV/YAML library. It warns with
  the exact workload, runs sequentially, preserves existing previews and can
  stop after the current image so a later run resumes the missing set.
- Automatically closes only the OmniLoko process started by NovoLoko after the
  final active OmniLoko request. A user-opened OmniLoko remains open, and
  Kokoro/Off never launch it.
- Keeps manual upload, existing image-folder batch import and card selection.

## Compatibility

All 33 node IDs, inputs, outputs, socket order, widget order and v3.5.0 workflow
links are unchanged.

## Upgrade

Run the NovoLokoLabs updater, restart ComfyUI completely, then press `Ctrl+F5`.
