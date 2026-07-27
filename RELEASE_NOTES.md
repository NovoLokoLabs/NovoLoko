# NovoLoko v3.9.7

This corrective patch repairs the **NovoLoko Generation Timer** in ComfyUI
Nodes 2.0:

- removes the broad Timer CSS selector that matched ComfyUI's own node-body
  header class and hid the complete Timer surface
- keeps the Timer DOM controls visible with a non-zero layout contract
- preserves saved Timer dimensions, workflow serialization and legacy
  LiteGraph rendering
- retains the v3.9.6 Nodes 2.0 Text Display renderer and its saved output
- adds executable frontend regression coverage for the Timer layout contract

All 34 serialized node IDs, inputs, outputs, socket order and widget order remain
unchanged. No supplied user workflow, preview, favourite, seed history, media or
other personal runtime data is included in the release.

Close and restart ComfyUI Desktop completely after installing the update so its
embedded frontend loads the v3.9.7 JavaScript files.
