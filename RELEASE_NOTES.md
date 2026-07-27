# NovoLoko v3.9.6

This patch release repairs the actual **NovoLoko Text Display** output nodes in
ComfyUI Nodes 2.0:

- adds a native Nodes 2.0 DOM surface for Text Display output instead of relying
  on the LiteGraph canvas body that Nodes 2.0 skips
- shows saved output immediately after loading a workflow
- refreshes displayed output immediately after execution
- preserves the existing legacy LiteGraph canvas renderer
- preserves manual resizing, scrolling, copy controls and word/character counts
- prevents duplicate Text Display surfaces across delayed lifecycle calls
- adds executable frontend regression coverage for Nodes 2.0 mounting, saved
  output restoration and counters

All 34 serialized node IDs, inputs, outputs, socket order and widget order remain
unchanged. No supplied user workflow, preview, favourite, seed history, media or
other personal runtime data is included in the release.

Close and restart ComfyUI Desktop completely after installing the update so its
embedded frontend loads the v3.9.6 JavaScript files.
