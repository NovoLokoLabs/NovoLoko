# NovoLoko Changelog

## v4.6.3 - MiniMax Music 3 corrective hotfix - 2026-08-17

- Replaced intrinsic/flex inference with real DOM-widget allocated height in
  legacy/classic and Nodes 2.0; compact, default, 720x1040 and tall layouts now
  reflow without clipped preset/category rows.
- Removed the category scrollbar once all 19 rows fit, expanded SONG IDEA only
  after that point, capped it at 280 px, and capped excessive empty-body growth
  at the measured content ceiling.
- Fixed duplicated selector text such as `Pearl Jam — Pearl Jam — Clone`.
- Added searchable Måneskin and Counting Crows Clone/Like pairs, bringing the
  library to 102 artists, 204 visible artist variants and 270 visible presets.
- Clarified next-run seed behavior and added successful-run status without
  changing any category policy.
- Carried Very Explicit/Uncensored requirements across the enhancer boundary
  and added one clean-draft retry; expanded plain-English below-fold labels.

## v4.6.2 - Music Controls quality pass - 2026-08-17

- Added paired `Artist — Clone` and `Artist — Like` choices for all 100 suitable
  artist-reference labels. Clone applies very strong descriptive DNA across era,
  vocal character, instruments and tones, drum feel, tempo, arrangement,
  dynamics, hooks and mix; Like keeps the broad lane with more freedom.
- Kept all v4.6.1 artist preset names as hidden migration aliases. Artist names
  remain search/audit labels and are never inserted into the music or lyric
  generation briefs.
- Appended a compatibility-safe manual-override record after the complete
  v4.6.1 widget contract. Editing one control now replaces only that matching
  reference trait; other Clone/Like DNA remains active and visible in the batch
  transparency report.
- Reworded all 19 control labels in plain language and added a concise selected-
  value explanation without changing serialized category keys or choice names.
- Added 13 practical instrument rigs, including electric guitar/bass/live drums,
  grunge, pop-punk, heavy double-kick, funk, trap, cinematic, industrial,
  shoegaze, reggae and Afrobeat setups. Rewrote the weakest energy, darkness,
  rhyme, story and ad-lib templates so their choices materially change prompts.
- Made Explicit, Very Explicit and Uncensored active lyric-writing requirements;
  the stronger levels now request natural frequent profanity and adult language
  when stylistically appropriate while retaining fictional-content safeguards.
- Added the v4.6.2 Music Lab workflow and expanded recipe v2/transparency data
  additively with display values, reference mode, strength, traits and overrides.
- Preserved the v4.6.1 `620 x 760` default, `420 x 480` minimum, actual-body
  measurement, Nodes 2.0 containment, hidden native widgets, writer setup and
  Ollama aliases unchanged.
- Completed the classic/legacy responsive pass: the category scrollbar now
  disappears when all 19 rows fit, SONG IDEA grows into available height up to
  a useful cap, and compact/tall/very-tall layouts remain overlap-free in both
  classic and Nodes 2.0.
- Replaced the user-facing Ollama model text box with an auto-refreshing local
  model picker. FAST, BALANCED and GEMMA show friendly labels plus their actual
  aliases; missing recommendations are explicit, every other local model is
  selectable, and manual entry remains under Advanced.
- Added **After run: Fixed / Randomize Seed** beside the seed. Seed-only mode
  mirrors ComfyUI's after-generate policy, never changes the 19 choices, and is
  recorded in transparency and recipe v2. Legacy workflows with a genre value
  shifted into `control_after_generate` migrate deterministically.
- Strengthened ~1:30 through ~5:00 duration steering. The chosen seconds still
  wire directly to MiniMax `max_duration`; ~5:00 now requests a 300-second max,
  at least ten substantial sections, 650-900 lyric words and instrumental
  breathing room while honestly warning that MiniMax may finish early.
- Added persistent audio favorites using a small folder sidecar index: favorite,
  unfavorite, filter and sort without mutating audio. Favorites follow paired
  renames and are removed when a track is moved to recoverable trash.
- Added a 120-520 px lyrics-height control while retaining karaoke, follow and
  copy behavior, plus a clear **One-off: clean after run / Batch: keep loaded**
  saver lifecycle selector with legacy cleanup compatibility.

## v4.6.1 - Responsive Music Controls and local writer A/B path - 2026-08-16

- Replaced the fixed-height Music Controls DOM widget with a growable body based
  on the actual ComfyUI allocation. Manual sizes remain free between compact
  minimums and a corrupt-data guard; the 19-category list scrolls internally.
- Hidden every preserved backend widget through both classic LiteGraph and Nodes
  2.0 visibility state, preventing duplicate stock rows from pushing the custom
  SONG IDEA / CSV panel down after a tab switch or reload.
- Added compact custom mirrors for Randomize All, seed and allow-None without
  changing serialized widget/socket order or recipe v2 behavior.
- Added an optional loopback-only Ollama GGUF writer loader, setup guide and real
  3A/3B/3C A/B benchmark. The Qwen3-VL writer and MiniMax native text encoder
  paths remain compatible and unchanged.

## v4.6.0 - Unified Music Controls, lossless recipes and fast batches - 2026-08-16

- Merged Short Music Idea into the existing `NovaMusicControls` node without
  removing the legacy `NovaMusicIdea` class needed by older workflows.
- Added a versioned v2 track recipe with `original_idea`, all 19 original
  Random/Custom/None decisions, custom text, exact resolved choices, random
  scope/filter, allow-None policy and integer seed.
- Fixed built-in and user preset restoration, including Nodes 2.0 numeric combo
  values, booleans, custom fields and saved random policy.
- Hardened the responsive panel against both corrupt node size and corrupt
  saved panel height, returning the supplied workflow to 620×760.
- Added live per-stage timing for enhancer/model load, lyric enhancer, lyrics
  generator, caption enhancer, MiniMax generation, save and cleanup.
- Defaulted all three music text writers to Thinking Off while retaining their
  individual toggles.
- Added Memory Manager **Fast Batch / Reuse** mode and made it the workflow
  default; Balanced remains available for one end-of-batch cleanup.
- Added a v4.5.1-to-v4.6.0 workflow migrator and regenerated the latest layout
  without the standalone idea node.

## v4.5.1 - Stable controls, scoped preset random and audio formats - 2026-08-16

- Removed the self-referential DOM/node height calculation and automatically
  repairs corrupted Music Controls sizes above the safe maximum.
- Added seed-stable complete-preset randomization across all presets, one preset
  folder, or one genre, with the exact chosen preset recorded in transparency.
- Restored 24-bit WAV, FLAC, 320 kbps MP3 and OGG saver choices while retaining
  paired TXT/JSON basenames and duplicate-safe indexing.
- Added a numeric volume percentage to the player.
- Added karaoke sync offset and opt-in internal lyric following; following is
  off by default and no longer moves the node or canvas view.

## v4.5.0 - Track recipes, lyrics and resilient visualizer - 2026-08-15

- Added sidecar-backed **Load Track Recipe** for exact restoration of all 19
  Music Controls choices, custom values, None decisions, random policy and seed.
- Added matched lyrics, copy, and clearly labelled estimated karaoke to the
  Audio Library / Player without adding blocking graph work.
- Fixed the live visualizer stopping after a new run, visualizer-height change,
  or player/node resize.
- Fixed the Music Controls DOM panel's width feedback loop and horizontal growth.
- Strengthened artist-reference steering with prompt-neutral high-priority
  reference DNA built from era, vocal, instrument and production traits.
- Preserved node IDs, sockets, widget order, batch transparency, sidecar pairing,
  and the post-save Balanced Memory Manager pattern.

## v4.4.0 - Preset discovery, spoken voice and live visualizer - 2026-08-15

- Expanded the 19 Music 3 libraries to 752 choices and 166 built-in presets.
- Added foldered preset browsing plus search by genre, instrument, artist/band/group/DJ reference and descriptive keywords.
- Reference names remain discovery metadata; generated music captions use descriptive traits rather than asking to copy an artist.
- Added spoken-voice-only presets for anger, sadness, sensual whispering, yelling, ASMR, documentary, podcast, meditation, sermon, emergency broadcast and more.
- Added six Web Audio visualizer styles with adjustable in-node height, bass-reactive animation and a lightweight BPM estimate.
- Expanded the in-workflow Start Here guide with complete generation, preset, speech, player, save and memory instructions.

## v4.3.1 - Responsive panels and persistence repair - 2026-08-15

- Made Music Controls, Audio Library / Player and Prompt Stack internal canvases follow manual node height instead of leaving fixed-height panels and blank space.
- Reserved an explicit Prompt Stack panel gap so `random_mode` can no longer overlap the slot canvas.
- Added **Show Selected in Folder** to reveal the active audio file directly in Windows File Explorer.
- Repaired Nodes 2.0 numeric combo-index handling for Prompt Enhancer saved custom presets and target model / prompt format.
- Persisted the resolved Prompt Enhancer target mode in node properties so workflow reloads retain the last valid selection.
- Added selected-node seed wheel adjustment across NovoLoko nodes; the canvas keeps normal zoom when the pointer is not over a selected seed row.

## v4.3.0 - Expanded Music Lab and Audio Library - 2026-08-15

- Fixed the v4.2 saver/Memory Manager link-ID collision and saver input-order mismatch that caused ComfyUI's `Cannot read properties of undefined (reading 'output')` toast.
- Added strict workflow endpoint/link validation and repaired the stale Controls widget offset while preserving node IDs and the working save-to-memory-cleanup architecture.
- Expanded the 19 Music 3 libraries to 552 built-in choices and 45 genre-spanning presets.
- Added None, per-category Custom text, seed-stable Random rules, exact resolution reporting, and update-safe user preset save/load/rename/delete/refresh.
- Added the NovoLoko Audio Library / Player with transport, seek, timing, volume, repeat, shuffle, search, sort, external-folder browsing, metadata, paired rename, and recoverable paired trash.
- Made selected/focused Text Display wheel scrolling explicit while preserving unselected canvas wheel behavior, text selection/copy, visible scrollbars, and middle-mouse pan.

## v4.2.0 - Consolidated MiniMax Music 3 archive build - 2026-08-15

- Added `NovoLoko Save Audio + Prompt Metadata`, producing matched duplicate-safe
  24-bit WAV/TXT/JSON sets under `output/audio/NovoLoko/` from the actual
  connected batch values, with Windows-safe names and optional compact WAV tags.
- Added a conservative optional terminal model/CUDA cleanup control. It remains
  off by default and never unloads between the shared 3A/3B/3C text passes.
- Added a frontend migration for shifted legacy Music Lab writer widgets,
  including the known invalid creativity `0` / max length `1` pair.
- Repaired selected/focused Text Display wheel scrolling while preserving normal
  unselected canvas wheel navigation, selectable text, visible overflow scrollbars
  and middle-mouse canvas pan in Legacy and Nodes 2.0.
- Made the requested Generation Timer settings fresh-node defaults: Full Stats,
  radius 5, 20-run history, all status/stat fields on, glow off, packaged Cash
  finish sound and volume 35; the existing color palette is unchanged.
- Added Gregorian Drill Opera / Holy 808, CUDA Out of Memory and What Did I
  Generate examples without removing any original genre libraries or presets.
- Rebuilt the default Music Lab workflow with exact 3A/3B/3C widget serialization,
  the timer defaults, the metadata saver, and direct batch-transparency wiring.

## v4.1.0 - MiniMax Music 3 validation and navigation hotfix - 2026-08-15

- Aligned the 3A, 3B and 3C creativity schemas with FLOAT values from 0.0 to
  1.0 in 0.05 steps, using defaults 0.85, 0.90 and 0.70 respectively.
- Aligned all three writer nodes and the supplied Music Lab workflow to valid
  max-length values from 256 to 8192: 2048 for 3A, 4096 for 3B and 2048 for 3C.
- Restored normal ComfyUI wheel navigation over large Text Display nodes while
  keeping text selectable/copyable, the scrollbar draggable and middle-mouse
  canvas panning available.
- Kept the selected-options batch-transparency output and ordering unchanged.

## v4.1.0 - MiniMax Music 3 Lab - 2026-08-15

- Added one current five-node MiniMax Music 3 pipeline: Music Idea, CSV Controls,
  Lyric Enhancer, Lyrics Generator and Music Caption Enhancer.
- Added 19 independent CSV control categories with 154 entries plus six presets,
  including heavy rap/trap/drill and contrasting synthwave, dream-pop, acoustic
  soul, industrial and orchestral configurations.
- Added deterministic per-category and whole-preset randomization from a shared
  seed, with a complete `selected_options` report for transparent batches.
- Kept lyrics and music captions on separate model-generation paths. Lyrics use
  MiniMax section tags; captions use Global Metadata, Vocal Details and
  Arrangement headings and cannot consume the generated lyric text.
- Added an example workflow wired to current ComfyUI MiniMax Music 3 core nodes
  and the existing generative Qwen/Krea2 enhancer CLIP pattern.
- Preserved all existing v4.0.2 node IDs, schemas, widget/output order, Prompt
  Stack behavior, current workflows and optional-safe execution.

## v4.0.2 - Legacy expanded-slot clipping fix - 2026-08-14

- **legacy expanded-slot clipping fixed**: expanded Prompt Stack cards are no
  longer allowed to flex-shrink to header height inside the fixed scroll panel.
- Remeasures each slot and the complete scroll-content height immediately after
  individual toggles, Expand All / Collapse All, add, copy, remove and reorder.
- Removes stray horizontal bars from hidden compatibility widgets by using
  ComfyUI's no-draw hidden-widget representation while preserving serialization.
- Keeps the outer 450/520/600 px panel fixed; seven or twenty expanded slots
  scroll internally with every Folder filter, Folder, CSV file, Category,
  Search and Selection control visible at normal spacing.
- Confirms every v4.0.1 consolidated feature remains present in this same build:
  legacy/classic + Nodes 2.0, unlimited dynamic slots, recursive folder-aware
  filtering, refresh, collapse controls, the visual Medium browser, stable
  prompt/output contracts and selected-names-only `all_names`.

## v4.0.1 - Prompt Stack AIO Pro consolidated build - 2026-08-14

- Ships **Legacy + Nodes 2.0** compatibility, recursive **folder filtering**,
  **dynamic slots**, a **fixed-height scroll panel**, **Collapse All / Expand
  All**, and clean selected-names-only **`all_names`** together in this same
  build.
- Uses the 450/520/600 px internal panel in classic and Nodes 2.0 whenever the
  frontend DOM-widget API is available; retains tested native controls for
  older classic frontends that do not expose that API.
- Keeps Add, Copy, Remove, Up, Down, enabled state, labels, per-slot collapse,
  random mode/seed behavior and panel size across workflow save/reload.
- Preserves the existing Python input/output order, hidden legacy widgets,
  legacy seven-slot migration, stable per-slot seed offsets, refresh/clear
  actions and Browse Medium Styles integration.
- Adds executable runtime coverage for classic DOM, Nodes 2.0 DOM, the native
  fallback, 20+ slot mutations, save/reload and 24-slot `all_names` ordering.

## v4.0.0 Prompt Stack compatibility refresh - 2026-08-14

- Restores Prompt Stack AIO Pro dynamic-slot controls in legacy/classic
  LiteGraph with native widgets while retaining the Nodes 2.0 slot-card panel.
- Adds recursive per-slot folder discovery, folder search, folder-filtered file
  choices and concise filenames with full relative-path tooltips.
- Refresh now reloads folders, files, categories and entries while keeping a
  selected file when it is still valid in the chosen folder.
- Preserves legacy widget/output order, dynamic add/remove/copy/up/down,
  selected summaries, prompt outputs and selected-names-only `all_names`.

## v4.0.0 — Workflow presentation, LoRA tools and dual-frontend parity

- Adds NovoLoko Power LoRA Stack with random pools, presets, trigger words,
  row ordering, CivitAI browsing, model information and downloads.
- Adds NovoLoko Group Controller with search, sorting, colors, solo,
  navigation, random selection and full-row toggles.
- Adds the resizable Workflow Banner and Workflow Cheat Sheet presentation
  nodes with clickable links, configurable appearance and copy actions.
- Aligns Timer, Text Display, Prompt Enhancer, Voice TTS, Compare Studio and
  Media Studio behavior across legacy LiteGraph and Nodes 2.0.
- Expands Prompt Stack with a combined all-names output, manual prompt
  inclusion, subject placement beside Medium and the updated CSV/YAML library
  pack.
- Adds Media Studio project folders, filename-prefix handling, current seed
  display/copying and improved legacy graph navigation.
- Ships the exact NovoLoko AIO v4.0.0 workflow and the Global Variety library
  update.

## v3.9.7 — Nodes 2.0 Timer repair

- Removes the Timer CSS selector that matched ComfyUI's Nodes 2.0 node-body
  header class and hid the entire Timer surface.
- Keeps the Timer DOM controls visible with a non-zero minimum layout size.
- Preserves saved workflow dimensions and legacy LiteGraph rendering.
- Adds executable frontend regression coverage for the Timer layout contract.

## v3.9.6 — Nodes 2.0 Text Display output

- Adds a DOM-backed renderer for NovoLoko Text Display when Nodes 2.0 is active.
- Restores saved output after workflow load and refreshes output after execution.
- Preserves manual resizing, scrolling, copying and text counters.
- Leaves the legacy LiteGraph canvas renderer unchanged.
- Adds executable frontend regression coverage for mounting and restored state.

## v3.9.5 — Independent Compare line and Nodes 2.0 Notes

- Makes Compare Studio's **Line** opacity independent from **Guide** in the
  node preview, full-screen viewer, copied images and saved exports.
- Keeps **Guide On/Off** responsible only for the circular drag handle while
  the invisible split drag area remains active.
- Repairs Note and Markdown Note in Nodes 2.0 by reusing the connected Vue
  textarea instead of the detached legacy editor object.
- Keeps the legacy native Note editor unchanged and creates no duplicate
  editor in either frontend.
- Preserves multiline Note text and manually saved dimensions through workflow
  serialization and reload.
- Adds executable frontend regression coverage for independent divider/handle
  decisions and delayed Notes mounting.

## v3.9.4 — Dual-frontend Compare and resize reliability

- Makes Compare Studio's **Guide** toggle consistently hide both the divider
  and circular handle in the node preview, full-screen viewer, copied images
  and saved exports while keeping the invisible split drag area active.
- Keeps node-preview and full-screen Guide/Line properties and global defaults
  independent, with one-time migration for existing workflows.
- Adds executable frontend regression coverage for rendering, copy/save,
  dragging, state isolation and workflow reload.
- Preserves exact manual sizes for Seed Lab, Voice TTS, Timer, Note and Markdown
  Note in both legacy LiteGraph and Nodes 2.0, including legacy typed-array
  dimensions.
- Repairs legacy Compare remounting, Nodes 2.0 Note/Timer controls, and global
  style-preview numbering with a stable large-viewer position counter.

## v3.9.3 — Revised style libraries and saved node dimensions

- Imports the latest nine user-edited wildcard CSV libraries and their nine
  matching YAML libraries from the installed `_FINAL` source copies.
- Keeps the canonical release filenames so users do not receive duplicate
  `_FINAL` entries.
- Stores Seed Lab and Voice TTS manual width/height during resizing and
  serialization.
- Restores those saved dimensions after the nodes' asynchronous DOM controls
  finish loading, without changing serialized inputs, outputs or widget order.

## v3.9.2 — Compare, style viewer, and OmniLoko launch polish

- Matches Media Studio's split controls: **Guide** shows or hides only the
  draggable handle, while **Line** independently controls divider transparency
  in both the node preview and full-screen Compare Studio.
- Keeps the source point under the mouse while zooming a large style preview.
- Adds **Generate new** inside the large style viewer to run and replace the
  currently displayed preview.
- Starts execution-triggered OmniLoko instances hidden and adds a non-serialized
  **Open OmniLoko** button to the Voice TTS node.
- Preserves manually enlarged Voice TTS node dimensions while accommodating the
  new button.

## v3.9.1 — Style workflow and comparison controls

- Remembers the last 512 or 1024 style-preview size across browser sessions and
  shows each saved preview's actual pixel size on its card.
- Opens the visual CSV/YAML style browser directly from Manual Prompt and lets
  that node apply either CSV or YAML style records without changing its sockets
  or serialized widget order.
- Makes Seed Lab's manual-random action queue the workflow immediately and adds
  a separate **Fixed Seed Run** button.
- Makes Compare Studio's Guide toggle hide the complete divider and makes line
  transparency update both the node preview and full-screen composition.
- Preserves saved and manually resized node dimensions; no configure-time resize
  operation was added.

## v3.9.0 — Expanded libraries and persistent Desktop style tools

- Imports the updated installed CSV/YAML libraries, including 397 uploaded
  medium styles and focused anime, cartoon, comics, 3D/design, digital painting,
  drawing, fine-art and photography collections.
- Keeps whole-library preview generation alive when its browser closes and
  restores the same progress/Stop control when reopened.
- Treats ComfyUI's normal Cancel action as a cancellation of the active preview
  batch.
- Allows the large preview viewer to zoom beyond the window up to 32× with
  two-axis panning.
- Adds controls to open or change the managed preview-output folder. The chosen
  absolute path remains ignored local runtime state and is never committed.
- Marks NovoLoko node resize actions as workflow changes so manually saved
  dimensions persist.
- Repairs corrupted punctuation in node and group titles as older workflows load
  while leaving prompt widgets untouched.
- Updates current workflow and release metadata to v3.9.0 with all 34 serialized
  node contracts unchanged.

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
