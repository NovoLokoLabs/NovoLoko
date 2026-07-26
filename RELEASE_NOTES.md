# NovoLoko v3.9.2

This patch release completes the requested Compare Studio, style-viewer and
OmniLoko launch behavior in ComfyUI Desktop:

- makes Compare Studio match Media Studio by keeping the split divider and
  draggable guide handle independent
- makes **Guide On/Off** control only the handle and **Line** control only
  divider transparency in both node and full-screen views
- zooms large style previews toward the mouse pointer instead of the viewer
  centre
- adds **Generate new** inside the large style viewer to regenerate and replace
  the displayed preview
- starts OmniLoko hidden when a TTS execution needs its bridge, preventing the
  app from covering ComfyUI on every run
- adds a non-serialized **Open OmniLoko** button to the Voice TTS node for
  explicitly opening or restoring the desktop app
- preserves manually enlarged Voice TTS and Compare Studio node dimensions

All 34 serialized node IDs, inputs, outputs, socket order and widget order remain
unchanged. The supplied workflow files contain no personal prompt, media,
preview, seed-history or Compare Studio runtime state.

Close and restart ComfyUI Desktop completely after installing the update so its
embedded frontend and Python routes load the new NovoLoko files.
