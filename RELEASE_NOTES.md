# NovoLoko v3.6.1

This patch makes the local visual style library useful as a generate-and-review
workflow without changing any serialized node contract.

## Improved

- Real preview images now fit completely inside their cards without cropping.
- **Generate + save preview** applies the selected style, queues the current
  ComfyUI workflow and saves its final generated image to that style.
- Generation works from Prompt Stack and CSV/YAML Style Loader browsers.
- Standalone generation finds the selected compatible node, or the only
  compatible node in the workflow.
- Existing preview images are preserved if generation fails or returns no image.
- Manual add, replace, remove and 512/1024 batch importing remain available.

## Compatibility

All 33 node IDs, inputs, outputs, socket order, widget order and v3.5.0 workflow
links are unchanged.

## Upgrade

Run the NovoLokoLabs updater, restart ComfyUI completely, then press `Ctrl+F5`.
