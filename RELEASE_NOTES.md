# NovoLoko v4.6.4

NovoLoko v4.6.4 is the locked MiniMax Music 3 Lab library, writer-backend,
external-seed and viewport-lifecycle release. It adds 275 named artists while
preserving all 102 existing artists and migration aliases. The final library
contains 377 named artists, 754 visible Clone/Like variants, 107 Genre values,
386 Style/Era values, 820 visible built-in presets and 1,429 choices across the
19 independent control libraries.

Every control received a practical editorial expansion. The largest passes are
Singer Performance (58 to 109), Lead Voice Type (39 to 79), production/mix
(73 to 120), instruments (92 to 132), themes (52 to 83), mood (40 to 65),
hooks (34 to 58) and song layouts (33 to 53). Stored values, recipe v2, the 48
serialized widgets, node IDs, socket order and separate lyric/caption paths are
unchanged.

The main workflow now makes the writer backend explicit. Ollama GGUF is the
default and its live model picker exposes friendly FAST, BALANCED and Gemma
choices plus all other installed local models. The existing Comfy safetensors
Qwen writer remains a selectable fallback. A real direct Comfy GGUF causal node
was found and inspected, but the installed `llama-cpp-python` runtime fails
before model load because `ggml.dll` or one of its dependencies cannot load;
v4.6.4 therefore does not misrepresent that path as supported. The native
MiniMax Music 3 int8-convrot text encoder is untouched.

An optional linked NovoLoko Seed Lab now owns the Controls seed cleanly. While
linked, the UI names the external source, disables stale internal seed editing
and suppresses the internal after-run policy. Disconnecting restores the prior
fixed/randomize behavior. The custom Controls body also defers zero-size
offscreen measurements and forces a fresh allocation when it re-enters the
viewport in Classic or Nodes 2.0.

Very Explicit/Uncensored still overrides a clean song idea with an active
fictional-song language requirement and one too-clean-draft retry. Duration
choices still send the literal requested maximum to MiniMax and describe long
targets honestly: in the v4.6.4 RTX 3090 acceptance run, a requested 300.0-second
maximum produced 241.232 seconds of audio. The model ended 58.768 seconds early,
so **Target ~5:00 — MiniMax may finish earlier** remains deliberate wording.

## Previous release: v4.6.3

NovoLoko v4.6.3 is a focused corrective patch for the MiniMax Music 3 Controls
regressions. Legacy/classic and Nodes 2.0 now size the custom body from the DOM
widget's real allocation, reflow narrow toolbar rows, expose progressively more
categories as height grows, remove the scrollbar when all rows fit, expand SONG
IDEA to 280 px, and stop at the content ceiling instead of leaving a giant dead
region. Manual `420 x 480`, `620 x 760`, `720 x 1040`, tall, tab, collapse and
reload behavior remains compatibility-safe.

Artist options now display exactly `Artist — Clone` or `Artist — Like`; the
renderer no longer prepends a duplicate artist name. The loaded library has 102
named artists / 204 visible variants and 270 visible built-in presets. Måneskin
and Counting Crows are present as searchable Clone/Like pairs. All 19 controls
retain stable stored values, while the below-fold controls now receive the same
plain-English display-label and one-line-help treatment.

The seed row now reads **Next run seed: Randomize after each run**. Run N uses
the current seed; after successful completion the UI reports the seed ready for
run N+1, with no dummy run and no changes to the 19 control policies. For clean
ideas with Very Explicit or Uncensored selected, the resolved requirement now
survives the lyric-enhancer stage; a still-clean first lyric draft is retried
once with the non-negotiable fictional-song language policy.

## Previous release: v4.6.2

NovoLoko v4.6.2 is the complete MiniMax Music 3 Lab usability and controls
quality pass. Classic LiteGraph now uses the same allocated-body sizing model
as Nodes 2.0: the category list scrolls only when it must, SONG IDEA grows into
available height, and tall nodes no longer leave a large grey region or retain
an unnecessary scrollbar. Compact, default, tall and very-tall sizes preserve
the `620 x 760` default and `420 x 480` minimum without control overlap.

The Ollama writer model is now selected from an automatically refreshed local
model dropdown. FAST, BALANCED and GEMMA are friendly labels for the actual
installed aliases; missing recommended aliases are reported clearly, every
compatible local Ollama model remains selectable, and a manual model name is
kept only as an advanced fallback. Ollama remains the supported fast writer
because it supplies a causal generation runtime, tokenizer/chat template, KV
cache and model lifecycle. The installed ComfyUI-GGUF loaders expose diffusion
or text-encoder model objects, not a standalone autoregressive `generate` API,
so no misleading direct-GGUF backend was added. MiniMax Music 3's native
int8-convrot text encoder is unchanged.

One hundred suitable
artist reference labels now have paired `Artist — Clone` and `Artist — Like`
variants. Clone uses very strong descriptive steering; Like keeps recognisable
broad DNA with more freedom. Generation briefs contain era, vocal, instrument,
drum, tone, tempo, arrangement, dynamics, hook and mix descriptions—not artist
names. A manual change overrides only its matching DNA trait, and the exact-
options report lists the mode, strength, locked/influenced traits and overrides.

All 19 controls now have plain-English labels and selected-value explanations.
The instrument library adds practical live-band, heavy, grunge, pop-punk,
acoustic, piano, funk, trap, cinematic, industrial, shoegaze, reggae and
Afrobeat rigs. Weak energy, darkness, rhyme, story and ad-lib prompt templates
were rewritten. Very Explicit and Uncensored now actively request frequent
natural profanity and adult language when appropriate while fictional-content
safety wording remains in both lyric stages.

Seed behavior is now explicit: **After run: Fixed / Randomize Seed** changes
only the seed while **Randomize all 19** remains a separate settings action.
Recipe v2 records the seed policy. Deterministic migration repairs the old
`control_after_generate` widget-order artifact without changing resolved
categories, node IDs, sockets or graph links.

Song-length choices now cover target durations from about 1:30 through 5:00.
The selected seconds continue directly to MiniMax; the five-minute target also
requests a longer section plan, lyric word budget and instrumental breathing
room. The UI is honest that MiniMax may still conclude before the requested
five minutes.

The Audio Library adds persistent metadata-safe Favorites, a favorites filter
and favorites-first sort. Stars are stored in a small sidecar index and never
rewrite the audio. The lyrics area has an adjustable height while copy,
estimated karaoke, follow, recipe loading, rename, trash, visualization and
playback behavior remain intact. The saver also offers clear **One-off: clean
after run** and **Batch: keep loaded** lifecycle modes while retaining the old
cleanup switch for workflow compatibility.

## v4.6.1 preserved baseline

NovoLoko v4.6.1 fixes the unified Music Controls layout in classic/current
ComfyUI and Nodes 2.0. The custom panel fills the body ComfyUI actually
allocates, its category list owns the internal scrollbar, and the preserved
serialized stock widgets are hidden through both frontend visibility systems.
The 620 x 760 default remains, manual compact/large sizes persist, and corrupt
saved dimensions are clamped without imposing a fixed giant body height.

This update also adds an optional local Ollama/GGUF writer loader and a fixed
idea/seed, thinking-Off benchmark for writer load plus stages 3A, 3B and 3C.
The existing Qwen3-VL writer loader remains valid. The MiniMax Music 3 native
text encoder is not replaced or modified.

## v4.6.0 baseline

NovoLoko v4.6.0 consolidates the MiniMax Music 3 Lab around one **IDEA + CSV
CONTROLS** node. Load Track Recipe now restores the original idea, exact 19
resolved choices, Random/Custom/None decisions, random scope/filter, allow-None
policy and integer seed without queuing a run.

New saves use `novoloko.minimax_music3.track.v2`, always include
`original_idea`, and carry a lossless controls recipe. Old v1 sidecars remain
loadable through a best-effort report parser. All three music text writers
default to Thinking Off but retain their toggles. The unified panel reports
enhancer/model load, lyric, lyrics, caption, MiniMax, save and cleanup times.

The workflow Memory Manager defaults to **Fast Batch / Reuse** so consecutive
songs keep models resident. Switch it to **Balanced** once at the end of a batch
to unload models and clear VRAM.

Load `workflows/NovoLoko MiniMax Music 3 - Lab v4.6.0.json` after a complete
ComfyUI Desktop restart. Existing v4.5.1 workflows continue to load; run
`python tools\migrate_music_workflow_v460.py "path\to\workflow.json"` to create
a separate unified migrated copy.

## Earlier v4.5.1 and v4.4.0 baseline notes

## v4.4.0 baseline

NovoLoko v4.4.0 is the consolidated MiniMax Music 3 expansion built from the
user's current v4.2 workflow. It preserves the separate lyric/caption paths,
exact batch selection report, paired saver, timer appearance and post-save
Balanced Memory Manager.

## v4.4.0 preset, speech and player expansion

- 752 control choices and 166 built-in presets across understandable folders.
- Searchable artist/band/group/DJ reference metadata across rock, metal, pop,
  R&B, hip-hop, electronic, global music, country, folk, jazz, blues, cinematic
  and ambient styles. Generated captions use neutral musical traits rather than
  telling the model to copy the named reference.
- Spoken-voice-only folders for emotional delivery, narration, broadcast,
  podcast, meditation, poetry, sermon, ASMR, yelling and whispering.
- Six live Web Audio visualizers with adjustable height, bass-reactive motion
  and a lightweight BPM estimate.
- A larger in-workflow Start Here guide covering the complete workflow.

## v4.3.1 follow-up fixes

- Music Controls, Audio Library and Prompt Stack canvases now grow and shrink with their node height.
- Prompt Stack reserves a layout gap before `random_mode`, removing the overlap shown in the live workflow.
- Audio Library adds **Show Selected in Folder** for the active track.
- Prompt Enhancer resolves Nodes 2.0 combo indexes back to their names, so saved custom presets load correctly and target model / prompt format survives workflow reload.
- On a selected NovoLoko node, wheel over its seed row to adjust the seed; wheel elsewhere retains normal canvas navigation.

## Install

1. Close ComfyUI completely.
2. Back up the current `ComfyUI-NovoLoko` folder and your workflow.
3. Replace the package with this `ComfyUI-NovoLoko` folder. Do not run an old
   NovaNodes/NovoLoko duplicate beside it.
4. Restart ComfyUI fully and use Ctrl+F5 once if the frontend was cached.
5. Load `workflows/NovoLoko MiniMax Music 3 - Lab v4.6.0.json`, or use the
   separate `Writer A-B v4.6.1` workflow only when testing Ollama models.

## Fixed first

The v4.2 workflow serialized link ID 64 into both the saver metadata path and
the Memory Manager, while its saver link tuple pointed a STRING at the AUDIO
input after ComfyUI reordered force-input sockets. This is the direct source of
the `Cannot read properties of undefined (reading 'output')` toast. The v4.3
workflow gives every connection a unique ID, targets the live saver socket
order, and validates all source outputs, target inputs and one-link-per-input
rules before packaging.

The stale extra `randomize` widget value in Controls and shifted writer widget
placeholders are also removed. Writer defaults remain 0.85/2048, 0.90/4096 and
0.70/2048.

## Music controls and presets

- 752 built-in choices across all 19 categories.
- 166 built-in presets across rap, R&B, pop, rock, metal, punk, techno, house,
  trance, DnB, jungle, dubstep, phonk, ambient, jazz, funk, blues, country,
  folk, reggae/dancehall, Latin/reggaeton, Afrobeat, gospel, lo-fi, vaporwave,
  shoegaze, horror and cinematic hybrids.
- None / No preference, Custom text and Random in every category.
- Random skips empty Custom and skips None unless explicitly allowed.
- Exact Options Selected records the resolved source and contribution.
- User preset save, load, rename, delete and refresh. User data lives under
  `ComfyUI/user/novoloko/music3/` and is not part of package updates.

## Audio library

The connected Audio Library / Player defaults to `output/audio/NovoLoko/` and
supports autoplay-new, play/pause, previous/next, ±10 seconds, seeking, current
and total time, volume/mute, repeat off/one/all, shuffle, search, sort, folder
browsing and format/duration/sample-rate/size details. It plays MP3, WAV, FLAC
and OGG where the embedded browser supports the codec. Rename keeps matched TXT
and JSON sidecars paired. Delete confirmation moves the set to a recoverable
`NovoLoko_Trash` subfolder.

## Existing behavior retained

- Matched WAV/TXT/JSON save under `output/audio/NovoLoko/`.
- Full metadata: idea, resolved selections, seeds, lyric brief, final lyrics,
  final music caption, models, duration, generation settings and timestamp.
- Memory Manager after save: Balanced, unload models, clear VRAM, collect
  Python and trim current process all enabled.
- No unload between the three shared-CLIP writer stages.
- Timer defaults: Full Stats, radius 5, history 20, all requested fields on,
  glow off, current colors retained, Cash.mp3 and volume 35.
