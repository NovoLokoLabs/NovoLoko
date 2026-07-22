# NovoLoko Changelog

## v3.2.7 — Verified audit fixes

- Made workflow migration preserve user prompt text while updating known serialized identifiers and visible package branding.
- Corrected JavaScript validation so ComfyUI frontend files are checked as ES modules.
- Made empty style searches resolve safely to `No Style` instead of falling back to the full catalogue.
- Made Prompt Styler random mode bypass ComfyUI caching for every queue.
- Added clean-checkout CI coverage and the minimum NumPy/Pillow development dependencies required by the tests.

## v3.2.6 — Clean rebrand release

- Rebranded all visible package, node-menu, workflow, frontend and documentation text to NovoLoko.
- Kept stable internal node IDs where practical for current-workflow compatibility.
- Removed registered legacy node versions and duplicate aliases so only one current entry appears for each node.
- Removed the duplicate legacy Text Display implementation.
- Included the latest AIO workflow with separate Prompt Enhancer instructions and status panels.
- Organized CSV/YAML libraries and renamed current assets to NovoLoko.
- Removed exact duplicate character files, superseded character exports, old pose revisions and older mega-mix revisions.
- Cleared packaged runtime history, favourites, absolute local paths and Python cache files.
- Consolidated optional voice installation and diagnostics.
- Added an old-workflow migration helper.
- Retained the v3.2.6 seed-history dark menu, wide text panels, enhancer presets and media-to-save wiring.
