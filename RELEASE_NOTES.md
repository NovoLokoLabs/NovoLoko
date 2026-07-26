# NovoLoko v3.9.3

This patch release imports the latest user-edited style libraries and makes
manual Seed Lab and Voice TTS dimensions survive workflow save/reopen in ComfyUI
Desktop:

- updates all nine focused/master wildcard CSV libraries from the installed
  `_FINAL` source files
- updates the nine matching YAML libraries with the same revised prompt text
- keeps canonical release filenames so the package does not ship duplicate
  `_FINAL` libraries
- records Seed Lab and Voice TTS width/height whenever either node is resized
- explicitly writes the manual size into workflow serialization
- restores the saved size after delayed DOM widgets and voice controls finish
  configuring
- scopes the new size persistence to `NovaSeedLab` and
  `NovaVoiceEngineTTS`, leaving other node layout behavior unchanged

All 34 serialized node IDs, inputs, outputs, socket order and widget order remain
unchanged. No supplied user workflow, preview, favourite, seed history, media or
other personal runtime data is included in the release.

Close and restart ComfyUI Desktop completely after installing the update so its
embedded frontend loads the new resize-persistence code.
