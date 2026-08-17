# NovoLoko v4.6.6

NovoLoko v4.6.6 is the accepted MiniMax Music 3 **Music Data v2** and runtime-reliability release. It keeps the user's current v4.6.5 Music Lab workflow layout and serialized node contract intact while rebuilding how genres, styles, randomization and artist references are resolved.

## Music Data v2

- Replaced the shallow pseudo-Genre list with broad parent genres and a real **Genre → Style / Era** hierarchy.
- Major lanes now appear where users expect them: Pop includes K-Pop, J-Pop, Dance Pop, Girl Group Pop and City Pop; Rock includes Grunge, Britpop and Shoegaze; Hip-Hop/Rap includes Boom Bap, Trap, Drill and G-Funk; Metal includes classic and modern metal families.
- Current hierarchical Style / Era depth includes Pop 61, Rock 51, Metal 36, Hip-Hop / Rap 45, Electronic 66, R&B / Soul 33, Reggae / Dancehall 17, Country 15, Jazz 23, Blues 13, Gospel 7, Ambient 9 and Spoken Word / Voice 11.
- Deliberate novelty hybrids are kept out of mainstream parents and grouped under Experimental / novelty lanes instead of polluting normal browsing.

## Coherent randomization and preset cleanup

- **Randomize Everything** no longer behaves like 19 unrelated slot machines. It now starts from a seed-stable coherent musical skeleton and applies compatible variation.
- Repaired obvious preset mismatches in instruments, production, structure, hooks, vocal identity and genre placement.
- Preset browsing is grouped and ordered predictably, with artist reference pairs kept adjacent.

## Artist references — more truthful, less fake certainty

- Removed hidden generic `base_preset` leakage from artist-reference generation.
- 377 named references remain searchable.
- 66 high-value references have complete hand-curated nine-trait artist-neutral DNA; the remaining 311 use explicit reference-row DNA fallback rather than hidden generic preset baggage.
- Artist names remain search/audit metadata and are not inserted into generation prompts.
- UI now says **Strong reference** / **Loose reference** while preserving serialized **Clone** / **Like** values for workflow compatibility.
- Strong and Loose produce structurally different prompts, but artist likeness is still limited by the downstream music model. This release deliberately does **not** claim reliable artist cloning.

## Audio Library / Player fixes

- Split **Auto-play new** from **Play next automatically**.
- Play next automatically is persisted and defaults Off.
- With auto-next Off and Repeat Off, a finished track stops instead of starting another song.
- Repeat one / Repeat all and manual Next remain coherent.
- Changing player checkboxes no longer restarts the current track.

## Prompt Stack AIO state repair

- Preserves live slot state instead of allowing stale callback/configure data to overwrite current selections.
- The seven-slot Medium / Subject / Pose / Action / Clothing / Location / Character setup now survives editing and workflow serialization/reload with enabled/collapsed state, folder, CSV, category, search, selection, seed offsets, random mode and manual fields intact.
- Retains the DOM Prompt Stack and dynamic slots; no rollback to the older native-only implementation.

## Mouse-wheel / canvas zoom behavior

- Audio Library and Prompt Stack now use directional wheel ownership.
- ComfyUI canvas zoom receives wheel input unless the pointer is over a real inner scroller that can still move in that direction.
- At a scroll boundary, wheel input hands back to the canvas rather than dead-ending.
- Node selected/unselected state no longer changes that rule.

## Validation

Acceptance source head before merge: `59997e6fe604a05a5726b001c6a00af20c1bc56f`.

- NovoLoko validator: 63 Python files, 25 JavaScript files, 32 workflows, 0 warnings.
- Git checkout: 214 tests passed.
- Clean extracted package: 214 tests passed with 1 expected Git-only skip.
- Clean stage/extract: 1,388 files each.
- Validation archive SHA-256: `fcba1b2e732b6c207acdda12451d23d387e62fc421e811c5f054a8d45d3a9169`.
- Disposable installed-ComfyUI + hidden Edge Classic smoke passed node registration, selected/unselected wheel handoff, real inner-scroll boundary release, exact seven-slot browser serialize/reload, resize and offscreen return.
- GitHub Actions `Validate NovoLoko` run #265 passed on the accepted PR head.

## Compatibility

- No workflow JSON change in the accepted Music Data v2 PR.
- Keeps the current v4.6.5 Music Lab workflow layout as the base.
- Preserves Music Controls node IDs, socket/widget contract, writer backends, external Seed Lab wiring, saver/player architecture, separate lyric/caption paths and MiniMax native text encoder.
- Strong/Loose reference labels are presentation-only compatibility aliases for existing Clone/Like serialized values.

## Install / update

Close ComfyUI completely before replacing the package or using the NovoLoko updater. After updating, restart ComfyUI fully and use Ctrl+F5 once if the frontend cache still shows the previous UI.
