# NovoLoko Changelog

## v3.8.0 — Workflow text, scalable browsing and packaged timer sounds

- Keeps visual cards at a readable square size while 24, 50, 100 or All results
  scroll vertically; removes the cramped 4/9 page choices.
- Adds an explicit standalone workflow-target selector so a chosen CSV/YAML
  library can be applied and generated through the intended Prompt Stack or
  Style Loader.
- Makes every NovoLoko node manually resizable to a substantially smaller
  minimum without overwriting saved workflow dimensions.
- Makes Compare Studio paint its selected frontend theme while removing stale
  serialized Compare-only blue colours from migrated official workflows.
- Repairs repeated UTF-8 mojibake in visible workflow text without changing
  normal prompt wording, node IDs, sockets, widgets or links.
- Packages 498 organized timer sounds under
  `data/NovoLokoTimerSounds/` and makes Generation Timer use that release-owned
  library recursively.
- Updates the cleaned current workflows and release metadata to v3.8.0 while
  retaining all 34 registered node contracts.

## v3.7.1 — Standalone visual-library hotfix

- Fixes the standalone **Styles** library selector endpoint failing during a
  real ComfyUI session because its server-side default was not defined.
- Adds an endpoint-payload regression test that confirms the default library is
  package-relative, listed and resolvable without exposing a local path.
- Keeps all 34 node IDs and every existing input, output, socket, widget and
  workflow link unchanged.

## v3.7.0 — Workflow controls, visual-library browsing and offline voice safety

- Adds a compact `NovoLoko Control Panel` with independent TTS and Prompt
  Enhancer switches while preserving every existing node contract.
- Lets the standalone **Styles** browser choose any packaged CSV/YAML library
  without exposing absolute paths.
- Adds 4, 9, 24 and 50-card page sizes and remembers the selected amount.
- Fills square cards edge-to-edge; double-click opens the uncropped large
  viewer instead of starting generation.
- Makes right-click consistently leave the current browser or large-viewer
  screen, while mouse 4/5 remains Previous/Next navigation.
- Stops owned preview generation when its browser closes.
- Makes the Seed Lab manual random action prominent while retaining Fixed,
  Random Every Queue, After-run control and 20-seed history.
- Allows saved OmniLoko preset identities to pass ComfyUI validation while
  offline, so disabled/Off mode stays silent and enabled mode can auto-start
  OmniLoko before resolving the preset.

## v3.6.3 — Visual-browser interaction controls

- Adds an explicit **Refresh** action for reloading CSV/YAML entries and saved previews without reopening the browser.
- Keeps preview-generation ownership outside the visual window so closing and reopening it still exposes **Stop generating** and prevents duplicate batches.
- Adds Previous/Next, mouse 4/5 and arrow-key navigation across saved images and styles.
- Adds bounded scroll-wheel zoom, zoom buttons, fit/actual-size switching and click-drag panning in the large viewer.
- Makes right-click exit the large viewer by default and adds persistent convenience options for auto-opening previews, wrapped navigation and right-click closing.
- Double-clicking a style now queues that exact style when no preview is already generating.
- Keeps favourite stars visible over captured preview images and preserves all existing node and workflow contracts.

## v3.6.2 — Visual preview workflow polish

- Adds **View larger** for every stored visual-style preview.
- Opens images uncropped in a full-screen viewer with fit-to-window and actual-size modes.
- Makes the floating **Styles** launcher clickable, draggable and position-aware.
- Adds confirmed, sequential **Generate all missing** support for a complete CSV/YAML library, with progress, stop-and-resume behavior and protection for existing previews.
- Closes only an OmniLoko process that NovoLoko auto-started, after the final active OmniLoko request; user-opened instances are never closed.
- Supports Escape, click-outside and an explicit Close button without changing node contracts or workflow links.

## v3.6.1 — Generated visual previews

- Fits each real style preview completely inside its card instead of cropping it.
- Adds **Generate + save preview** to apply the selected style, run the current ComfyUI workflow and automatically attach its final image to that style.
- Supports generation from Prompt Stack, CSV/YAML Style Loader and the standalone browser when one compatible target node is selected or available.
- Keeps manual image replacement, 512/1024 resizing, private local storage and all 33 serialized node contracts unchanged.

## v3.6.0 — Local visual preview libraries

- Added real user-supplied PNG, JPEG and WebP preview images to the visual style browser, stored privately under `data/style_previews`.
- Added direct 512x512 or 1024x1024 preview import, replacement and removal without exposing source paths.
- Added an always-available standalone Styles launcher and connected the same visual browser to Prompt Stack's Medium selector.
- Added `POPULATE_STYLE_PREVIEWS.bat` for safe filename or ordered batch population from an existing image folder.
- Kept generated previews out of Git and release archives while allowing updater overlays to preserve them.
- Preserved all 33 node IDs, inputs, outputs, socket order, widget order and v3.5.0 workflow links.

## v3.5.2 — Visual style and workflow-layout polish

- Added a full-screen visual library to the existing CSV Style Loader with search, categories, favourites, recent history, grid/list views, prompt details, random selection and pagination.
- Preserved manually resized Prompt Stack AIO dimensions when workflows are saved and reopened.
- Made the Memory Manager reliably compact by shortening visible controls and capping ComfyUI's calculated default width.
- Opens the installed OmniLoko application only when an actual OmniLoko voice execution needs it; Kokoro and Off mode remain isolated.
- Preserved all 33 node IDs, inputs, outputs, socket order, widget order and v3.5.0 workflow links.

## v3.5.1 — Updater-ready reliability hotfix

- Auto-starts an installed OmniLoko in private bridge-only mode only when a real OmniLoko TTS execution needs it.
- Shortens the Memory Manager title and lets existing oversized nodes shrink to a compact width.
- Defers full Media Studio history refresh until after the ComfyUI node returns, preventing large libraries from holding the queue open.
- Preserves full-resolution history images, the configured history limit, prompts, metadata, delete, revoice, autoplay and gallery navigation.
- Adds an updater-ready release workflow and clean ZIP packaging for patch releases.

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
