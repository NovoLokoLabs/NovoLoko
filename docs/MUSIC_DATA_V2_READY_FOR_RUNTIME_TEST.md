# Music Data v2 — acceptance repairs pending runtime retest

Branch implementation is intentionally not merged or released yet.

CI acceptance on the branch:

- NovoLoko validator: 63 Python files, 25 JavaScript files, 32 workflows, 0 warnings.
- Repository suite: 214 tests passed in the Git checkout.
- 377 named artist references remain searchable.
- 66 references currently have complete hand-curated nine-trait artist-neutral DNA; the remaining 311 use explicit reference-row DNA fallback without generic base-preset leakage.

Isolated runtime smoke evidence (disposable database/base directory and hidden Edge profile; the active ComfyUI Desktop session was not touched):

- the installed ComfyUI frontend registered `NovaMusicControls`, `NovaMusicAudioLibrary`, and `NovaPromptStackAIO` from the candidate;
- Classic-mode browser execution confirmed selected and unselected Audio Library and Prompt Stack roots hand non-scroll wheel events to canvas zoom;
- the real Prompt Stack list and Audio Library scroller retained wheel ownership while movable and handed it back at the end boundary;
- the exact seven-slot Medium / Subject / Pose / Action / Clothing / Location / Character state, including manual/random fields, survived browser serialization and node reload;
- the DOM panels remained connected after resize, move offscreen, and return.

Current hierarchical Style / Era counts by broad Genre include Pop 61, Rock 51, Metal 36, Hip-Hop / Rap 45, Electronic 66, R&B / Soul 33, Reggae / Dancehall 17, Country 15, Jazz 23, Blues 13, Gospel 7, Ambient 9 and Spoken Word / Voice 11.

The user's current v4.6.5 Music Lab workflow layout remains the runtime-test base; this branch does not modify workflow JSON.

The acceptance-repair pass separates Auto-play new from a persisted Play next automatically setting (default Off), preserves Prompt Stack transport state across callback/rebuild/refresh paths, and hands wheel input back to canvas zoom whenever an inner list cannot scroll in that direction.

Artist reference UX now displays Strong reference / Loose reference while preserving serialized Clone / Like compatibility values. Strong and Loose prompts are structurally distinct, but actual artist fidelity is a known model/output limitation and is not claimed as solved.

The user's saved v4.6.5 workflow in the native Desktop runtime, Nodes 2.0 interaction, real audio end-of-track behavior, and actual MiniMax sound matching still require user acceptance before merge/tag/updater publication. The isolated smoke is useful evidence, not a substitute for that acceptance.
