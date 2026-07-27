# NovoLoko v3.9.4

This patch release makes NovoLoko's legacy LiteGraph and Nodes 2.0 frontends
behave consistently:

- makes Compare Studio **Guide On** show the divider and circular handle, with
  the Line slider controlling divider opacity
- makes **Guide Off** hide both visible elements in the node preview,
  full-screen viewer, clipboard copy and saved export while keeping the
  invisible split drag area active
- separates node-preview and full-screen Guide/Line properties and global
  defaults, with one-time migration from existing shared values
- preserves both sets independently through workflow serialization and reload
- preserves exact manual sizes for Seed Lab, Voice TTS, Timer, Note and Markdown
  Note across both frontends, including legacy typed-array node dimensions
- repairs legacy Compare remounting and Nodes 2.0 Note/Timer controls
- keeps style-preview numbering global across pages and shows the current
  position in the large viewer
- adds executable JavaScript regression tests for the new frontend state and
  rendering decisions

All 34 serialized node IDs, inputs, outputs, socket order and widget order remain
unchanged. No supplied user workflow, preview, favourite, seed history, media or
other personal runtime data is included in the release.

Close and restart ComfyUI Desktop completely after installing the update so its
embedded frontend loads the v3.9.4 JavaScript files.
