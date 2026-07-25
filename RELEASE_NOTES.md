# NovoLoko v3.6.3

This patch makes the visual style browser faster and easier to control.

## Improved

- Adds an explicit **Refresh** button for the current CSV/YAML and preview set.
- Keeps **Stop generating** available when the browser is closed and reopened,
  interrupts the active ComfyUI preview job and prevents duplicate batches.
- Adds mouse 4/5 and arrow-key navigation through styles and saved previews.
- Adds bounded wheel zoom, zoom buttons, fit/actual-size modes and drag panning.
- Right-click closes the large viewer by default.
- Double-click queues the selected style when generation is idle.
- Keeps favourite stars visible on cards with real captured images.
- Adds persistent options for generated-image auto-open, wrapped navigation and
  right-click closing.

## Compatibility

All 33 node IDs, inputs, outputs, socket order, widget order and v3.5.0 workflow
links are unchanged.

## Upgrade

Run the NovoLokoLabs updater, restart ComfyUI completely, then press `Ctrl+F5`.
