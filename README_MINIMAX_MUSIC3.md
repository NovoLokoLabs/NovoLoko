# NovoLoko MiniMax Music 3 Lab

## Install

1. Close ComfyUI completely.
2. Keep a backup of your current custom-node folder and workflows.
3. Make sure no older `ComfyUI-NovaNodes` or duplicate NovoLoko package is active.
4. Copy this folder to `ComfyUI/custom_nodes/ComfyUI-NovoLoko`.
5. Restart ComfyUI, then load
`workflows/NovoLoko MiniMax Music 3 - Lab v4.6.3.json`.

The workflow expects the current ComfyUI MiniMax Music 3 core nodes and model
files. Its defaults match the user's installed files:

- `minimax_music3_dit_fp16.safetensors`
- `minimax_music3_text_encoder_pruned_int8_convrot.safetensors`
- `minimax_music3_dav.safetensors`
- `qwen3VLInstruct4bHeretic_v10.safetensors` for the three text-writing nodes

If a filename differs, choose the installed equivalent in the loader widget.

For the optional Ollama/GGUF writer, direct ComfyUI-GGUF findings and benchmark, see
`docs/MINIMAX_MUSIC3_WRITER_MODELS.md`. That path changes only the shared
creative writer connection for stages 3A/3B/3C; it never replaces the native
MiniMax Music 3 text encoder.

## Use

1. Type a short request into the **SONG IDEA** field at the top of
   **NovoLoko IDEA + CSV CONTROLS**, for example
   `heavy rap with cash and guns`.
2. Browse the preset folders or search by genre, instrument, descriptive
   keyword, or familiar artist/band/group/DJ reference. There are 270 current
   built-in presets. Every suitable artist reference has paired **Clone** and
   **Like** choices. Reference names are discovery/audit aids; generated lyric
   and music briefs use descriptive musical traits instead of the artist name.
3. Every category offers more built-in choices plus **None**, **Custom...** with
   its own text field, and seed-stable **Random**. Custom text is ignored unless
   Custom is selected. Random skips empty Custom and skips None unless **Allow
   Random to choose None** is enabled.
   **Random named preset** can instead pick one complete preset from **All
   Presets**, one **Preset Folder**, or one **Genre**, deterministically from
   the same seed.
   **Next run seed: Keep fixed / Randomize after each run** is independent. Run
   N uses the displayed seed; after successful completion the field reports the
   new seed for run N+1. It never changes the 19 control policies and needs no
   dummy run. **Randomize all 19** remains the deliberate settings action. Both
   the seed policy and the exact resolved settings are recorded in recipe v2.
4. Queue the workflow. The lyric path first builds a lyric brief and then tagged
   lyrics. The separate caption path produces the music-only MiniMax caption.
   All three text writers default to **Thinking Off** for speed; each node keeps
   its own Thinking toggle when a slower reasoning pass is wanted.
5. Review the three Text Display nodes before long runs: selected options,
   lyrics and caption are all visible in full. Select/focus a display and wheel
   over its text to scroll internally. An unselected display leaves wheel input
   to normal canvas navigation; middle-mouse canvas pan remains available.
6. The terminal **NovoLoko Save Audio + Prompt Metadata** node writes matched
   audio, TXT and JSON files under `output/audio/NovoLoko/` by
   default. Choose 24-bit WAV, FLAC, 320 kbps MP3 or OGG; compressed formats
   use FFmpeg.
7. The connected **NovoLoko Audio Library / Player** refreshes after each save.
   It includes autoplay-new, seek/time, transport, ±10 seconds, volume/mute,
   repeat, shuffle, search, sorting, folder browsing, safe paired rename and
   recoverable paired trash for MP3, WAV, FLAC and OGG libraries. Its live Web
   Audio visualizer offers six styles, adjustable height, bass-reactive motion
   and a lightweight BPM estimate. Favorite/Unfavorite writes only a small
   `.novoloko_music3_favorites.json` index; Favorites Only and Favorites First
   survive refresh and restart without modifying audio. The Lyrics Height
   control expands the matched lyrics panel while keeping the track list usable.
8. Select an older track with a matched JSON sidecar and choose **Load Track
   Recipe** to restore its original song idea, exact 19 resolved controls,
   None/Custom decisions, random policy and integer seed into the nearest
   unified Controls node. Loading only edits widgets; nothing regenerates until
   you press Run. Old v1 sidecars are reconstructed where practical.
9. **Show Lyrics** displays the saved final lyrics. **Estimated Karaoke** uses
   track progress to highlight lines; adjust **Sync** from -30 to +30 seconds
   when the vocals enter early or late. **Follow Lyrics** is off by default so
   the node and canvas never jump; when enabled it scrolls only inside the
   lyrics box. Timing remains estimated because MiniMax Music 3 does not save
   per-line timestamps.
10. Choose **One-off: clean after run** for an isolated song or **Batch: keep
    loaded** for consecutive songs. **Follow legacy cleanup switch** preserves
    older workflows. Read **Stage timing** inside the unified Controls panel
    after a run. It reports enhancer/model load, lyric enhancer, lyrics generator, music caption
    enhancer, MiniMax Music 3 generation, save and cleanup durations.

For speech rather than singing, open a **Spoken Voice** preset folder. Presets
cover angry, sad, seductive whisper, yelling, ASMR, documentary, podcast,
meditation, sermon, emergency broadcast and other deliveries, with explicit
no-singing instructions and dry or underscored arrangements.

`duration_seconds` feeds MiniMax's duration input without a NovoLoko clamp,
while `seed_used` feeds the text encoder and sampler. Connect NovoLoko Seed Lab
or another integer source to the Controls seed for reproducible or varying
batches. The eight target choices span about 1:30 to 5:00. The five-minute
choice also asks the writers for at least ten substantial sections and more
instrumental breathing room, but it is a target rather than a promise: MiniMax
may end a musically complete result early.

## Matched audio and metadata

The save node sanitizes Windows-invalid title characters and assigns the next
available four-digit index. Every batch item keeps the same base name across
its enabled outputs, for example:

```text
NovoLoko_Holy808_0001.wav
NovoLoko_Holy808_0001.txt
NovoLoko_Holy808_0001.json
```

The workflow wires the original idea, versioned lossless controls recipe,
actual Exact Options Selected report,
lyric direction, enhanced lyric brief, final structured lyrics, final music
caption, duration and seeds directly into the saver. The JSON also records the
literal model and sampler fields available in ComfyUI's execution prompt. Batch
inputs are paired before any files are written; the node does not read current
widget state after generation. Compact title/preset/seed information is embedded
in the WAV RIFF INFO block when **Embed Audio Metadata** is on.

The example keeps **Cleanup After Generation** off in the saver and connects its
audio output to **NovoLoko Memory Manager** after the completed save. The Memory
Manager defaults to **Fast Batch / Reuse**, which deliberately keeps models and
caches resident between consecutive songs. Switch it to **Balanced** once at
the end of a batch to unload models, clear VRAM and collect Python. It runs only
after the full save and never unloads between the three text-writing stages.

## Separation contract

The two MiniMax Music 3 text inputs remain separate all the way to
`MiniMaxMusic3TextEncode`:

- `lyrics` receives only the output from **NovoLoko Lyrics Generator**.
- `caption` receives only the output from **NovoLoko Music Caption Enhancer**.

The caption enhancer has no lyrics input. The lyrics generator has no music
caption input. The selection report is display/audit text and is not combined
with either final model input.

## CSV libraries and presets

The 21 files under `csv/music3/` contain one file per category, the main preset
table, and the artist-reference preset table. CSV entries can be edited in
place; keep each `name` unique and retain
the `name,prompt` columns. Song length also uses a numeric `seconds` column.

The 270 current visible built-in presets span drill, boom bap, rage, G-funk, R&B, neo-soul, pop,
alt rock, metal, metalcore, punk, techno, melodic techno, house, trance, DnB,
jungle, dubstep, phonk, ambient, horror score, jazz, funk, blues, country, folk,
reggae/dancehall, reggaeton/Latin, Afrobeat, gospel, lo-fi, vaporwave, shoegaze,
cinematic hybrids and the original fun hybrids such as Gregorian Drill Opera /
Holy 808. **Save Current as Preset** stores the resolved selections plus its
Random/Custom/None policy, seed and random-preset scope in
`ComfyUI/user/novoloko/music3/user_presets.json`; Rename, Delete and Refresh act
only on user presets, never the built-in CSV table.

Heavy rap themes include cash, luxury cars, fictional weapons imagery, rivals,
street life, success, paranoia, hustle, betrayal and revenge. The lyric prompt
treats violent material as fictional storytelling rather than instructions.

Artist references offer two strengths. **Clone** strongly locks descriptive era,
vocal character, instrumentation, drum feel, guitar/bass/synth tone, tempo,
arrangement habits, dynamics, hooks and mix character. **Like** keeps the broad
recognisable DNA while allowing more original movement. Changing one control
overrides only that matching DNA trait. The exact-options report lists the mode,
locked/influenced traits and overrides. The artist name remains a search/audit
label and is not sent to the lyric or music-caption generator. True audio-
reference conditioning would still require a model or adapter that accepts
reference audio. The current library contains 102 named artists, including
searchable Måneskin and Counting Crows Clone/Like pairs.

The 19 controls use plain-English labels and show a one-line explanation for the
selected value. Internal category keys and choice names remain stable for old
workflows and recipes. Practical bundles include Electric Guitar + Bass + Live
Drums, Heavy Guitars + Bass + Double-Kick Drums, Grunge, Pop-Punk, Acoustic with
Brushes, Piano Trio, Funk, Trap, Cinematic and Industrial rigs.

**Very Explicit** and **Uncensored** carry a non-negotiable language instruction
through the enhancer even when the short idea is clean. A first draft that is
still clean is retried once. Milder levels remain distinct. Crime, weapons and
rival themes remain fictional storytelling and never become real-world instructions.
