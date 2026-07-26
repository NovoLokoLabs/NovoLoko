# NovoLoko v3.9.1

This patch release improves the NovoLoko style, seed and image-comparison
workflow in ComfyUI Desktop:

- remembers the last 512 or 1024 style-preview generation size after the visual
  library closes and reopens
- displays each saved preview's actual pixel size in the lower-right corner of
  its card
- opens the visual CSV/YAML style library directly from Manual Prompt and lets
  that node apply styles from either file type
- makes **Manual Random Seed** generate a new fixed seed and immediately queue
  the workflow
- adds **Fixed Seed Run** to queue the workflow with the currently displayed
  seed
- fixes Compare Studio's Guide toggle and line-transparency control in both the
  node preview and full-screen composition
- preserves saved and manually resized node dimensions, including removal of a
  legacy Seed Lab auto-shrink rule

All 34 serialized node IDs, inputs, outputs, socket order and widget order remain
unchanged. The supplied workflow files contain no personal prompt, media,
preview, seed-history or Compare Studio runtime state.

Close and restart ComfyUI Desktop completely after installing the update so its
embedded frontend loads the new NovoLoko scripts.
