# NovoLoko Music Data v2 — audit and acceptance

This patch is an editorial/logic rebuild of MiniMax Music 3 data selection. It deliberately preserves the v4.6.x `NovaMusicControls` serialized widget/socket contract and does not rearrange the user's current Music Lab workflow.

## Why v4.6.4 felt large but shallow

The old library counted 107 Genre values and 386 Style / Era values, but Genre mixed broad parents with children (`Pop` beside `K-Pop`, `Rock` beside `Grunge`, `Hip-Hop / Rap` beside `Trap`, `Metal` beside `Metalcore`). `02_subgenre_era.csv` was flat and therefore could not express `parent genre -> child style` directly.

`Randomize Everything` also resolved all 19 controls independently. That could combine a useful genre choice with incompatible vocals, instruments, production and song structure.

Artist references inherited a generic `base_preset` and then overrode only populated reference fields. Empty artist fields therefore silently inherited generic hook/tempo/structure/theme choices. Those inherited values could appear in both Reference DNA and the normal music/lyric brief.

## Music Data v2 behavior

- Genre is a short list of broad, understandable parent lanes.
- Style / Era remains backward-compatible but is tagged with a broad parent and filtered in the DOM UI after Genre is chosen.
- Obvious children such as K-Pop, J-Pop, Grunge, Britpop, Boom Bap, Drill, Metalcore, Deep House and Amapiano live under their expected parent.
- `New Age / Meditation` is treated as an Ambient style family rather than another top-level Genre.
- Deliberately strange legacy hybrids such as Gregorian Drill Opera and Genre Roulette remain selectable but are grouped under Experimental rather than polluting mainstream parents.
- Randomize Everything chooses one coherent generic preset skeleton for musical controls, then allows seed-stable lyric-side variation. It remains deterministic and auditable.
- Generic presets receive targeted coherence fixes where old combinations were clearly wrong (for example bright pop with dark trap instrumentation, alternative rock with piano/string-quartet instrumentation, classic metal with a metalcore rig, dancehall with festival-EDM production, and instrumental techno with a vocal hook).

## Artist Reference DNA v2

Generation no longer treats generic base-preset leftovers as artist DNA.

Each reference can supply artist-neutral traits for:

1. era / genre / scene
2. vocal character and delivery
3. instrument, drum, bass, guitar and synth identity
4. tempo tendency and groove
5. arrangement and section habits
6. hook tendencies
7. dynamics and emotional arc
8. mix / production character
9. songwriting and phrasing character

Clone treats available traits as strong/locked. Like uses the same descriptive family more flexibly. A manual control override removes only the matching DNA trait.

High-value references receive a complete hand-curated nine-trait profile. Remaining references use only their explicit reference-row traits plus a neutral family section scaffold; they no longer inherit hidden generic base-preset values as if those values described the artist.

The lyric path now receives artist-neutral vocal/hook/songwriting DNA as well as the music-caption path. Artist names remain search/audit labels and are excluded from generation prompts.

## Preset browser

Backend ordering is deterministic:

- Quick Start remains frontend-owned.
- Generic presets are grouped into `Genre Presets / ...` folders.
- Artist references retain useful family folders, sort alphabetically by reference, and keep `Artist — Clone` immediately beside `Artist — Like`.
- User presets are grouped under `My Presets`.

## DOM wheel ownership

For Music Controls and Audio Library:

- selected/focused node + pointer over a genuinely scrollable internal surface => internal scrolling owns the wheel;
- unselected node => the wheel is forwarded to the Comfy canvas so normal zoom remains available;
- left-click selects the node; middle-mouse canvas behavior is not replaced.

This must still be checked in a real ComfyUI browser in both Classic and Nodes 2.0 before release. Static/frontend contract tests are not a substitute for that runtime acceptance.

## Runtime acceptance before merge/release

Use the user's latest uploaded `NovoLoko MiniMax Music 3 - Lab v4.6.5.json` layout as the test workflow. The patch itself intentionally does not rearrange that workflow.

1. Genre `Pop`: verify K-Pop, J-Pop, Dance Pop, Synth Pop, Girl Group Pop, City Pop and other obvious choices appear under Style / Era.
2. Genre `Rock`: verify Grunge, Britpop, Shoegaze, Classic Rock, Hard Rock and related rock families appear.
3. Genre `Hip-Hop / Rap`: verify Boom Bap, Trap, Drill, G-Funk and related choices.
4. Genre `Metal`: verify classic and modern metal families without needing separate top-level Genre entries.
5. Run `Missy Elliott — Clone` and confirm the resolved generation prompt no longer says 90s East Coast Boom Bap / Dusty Boom-Bap Mix unless manually selected.
6. Compare Clone / Like for Måneskin, Counting Crows, Nirvana, Pearl Jam, Paramore, BLACKPINK and another reference not in the deep-curated set.
7. On an artist Clone, manually change Instruments. Confirm the old instrument DNA disappears while vocal/production/songwriting DNA remains.
8. Queue 5–10 `Randomize Everything` seeds. Check that the musical core remains coherent and the transparency report identifies the guided strategy/skeleton.
9. With Music Controls unselected, wheel over its list and confirm the canvas zooms. Select the node and confirm the internal category list scrolls. Repeat for Audio Library.
10. Verify the uploaded workflow's Seed Lab, writer backend/subgraph, saver, Audio Library and node layout remain unchanged.

Do not tag or repoint the updater until these runtime/sound checks are accepted.
