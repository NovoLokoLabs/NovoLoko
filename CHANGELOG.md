# NovoLoko Changelog

## v3.5.0 — Voice, Compare and Media Studio reliability

- Reworked `NovaVoiceEngineTTS` controls so the active backend voice and Advanced options remain serialized while hiding cleanly, with an in-node Refresh Voices action and stale-preset warning.
- Allowed Compare Studio split positions to reach exact 0% and 100% in vertical and horizontal views, and removed official-workflow node colours that overrode ComfyUI themes.
- Added path-safe, reference-aware **Delete Current** to Media Studio so shared images remain available to other history entries.
- Added cancellable **Revoice Current** using the existing unified OmniLoko/Kokoro dispatcher, reusing stored prompts and image references without queueing any image-generation graph.
- Preserved all 33 node IDs, existing socket/widget ordering and v3.4.x workflow compatibility.

## v3.4.0 — Subject libraries and unified voice selection

- Added an append-only Subject slot to Prompt Stack AIO with independent file, category, search, selection, seeded random output and summary support.
- Added curated animal, real-car, fantasy and horror subject collections plus expanded automotive, animal, fantasy/horror action libraries and balanced location variety.
- Added `NovaVoiceEngineTTS`, a compact OmniLoko/Kokoro/Off selector that invokes only the selected existing backend and never cross-falls back.
- Updated the AIO workflow from the user's compatible v3.3.1 layout while preserving image-generation, enhancer, seed, Media Studio, metadata, compare, model and LoRA wiring.
- Preserved every released node ID, all existing Prompt Stack widgets and outputs in their original serialized order, and appended only the new Subject controls/output.

## v3.3.0 — OmniLoko TTS integration

- Added the public `NovaOmniLokoTTS` node for Current OmniLoko Profile and saved-preset speech through local LokoBridge v1.
- Added the published, dependency-free `lokobridge-client==1.0.0` requirement for Python 3.11 and later.
- Kept older Python installations and missing optional voice dependencies import-safe with actionable OmniLoko availability errors.
- Preserved all existing serialized node IDs, socket ordering, widget ordering and workflow links.

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
