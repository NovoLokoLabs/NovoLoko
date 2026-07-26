# NovoLoko v3.9.0

This release expands the visual libraries and fixes the remaining Desktop
style-browser and workflow-persistence issues:

- imports the updated NovoLoko CSV and YAML collections, including 397 uploaded
  medium styles and categorized anime, cartoon, comics, 3D/design, digital
  painting, drawing, fine-art and photography libraries
- keeps whole-library preview generation running after the style browser closes;
  reopening the browser exposes the same Stop control
- makes ComfyUI's normal Cancel action stop the active whole-library preview run
- lets large preview images zoom up to 32× without flex-shrinking back to the
  viewer bounds
- adds **Open previews folder** and **Change preview folder…** controls; the
  selected absolute folder is stored only as ignored local runtime state
- marks manual NovoLoko node resizing as a workflow change so dimensions persist
  when the workflow is saved
- repairs mojibake in visible node and group titles whenever older workflows load,
  without examining or changing prompt widgets
- refreshes the AIO and Compare Studio workflows for v3.9.0

All 34 serialized node IDs, inputs, outputs, socket order and widget order remain
unchanged.

Close ComfyUI, run the NovoLokoLabs updater, restart ComfyUI Desktop completely
and press `Ctrl+F5` if its embedded frontend still has an older cached script.
