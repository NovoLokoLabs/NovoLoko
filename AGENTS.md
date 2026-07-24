# NovoLoko — Codex Working Rules

NovoLoko is a ComfyUI custom-node package. Treat working workflows and node compatibility as the highest priority.

## Before changing code

1. Read `README.md`, `CODEX_START_HERE.md`, and `NovoLoko_v3.5.0_manifest.json`.
2. Run `python tools/validate_project.py` and keep the baseline result.
3. Inspect the exact node and its frontend JavaScript before editing either side.
4. Keep changes focused. Do not perform unrelated cleanup in a bug-fix task.

## Compatibility rules

- Keep stable internal node type IDs such as `NovaPromptEnhancer` unless a migration mapping is added and tested. These IDs are serialized into ComfyUI workflows.
- Visible user-facing branding must say **NovoLoko**.
- Do not reintroduce versioned duplicate menu nodes such as V1/V2/V3 aliases.
- Existing input names, output names, output order, widget order, and data types are public API. Do not change them casually.
- When adding an output, append it to the end so existing workflow links keep their slot numbers.
- Preserve optional-input behavior. Unconnected optional inputs must not cause execution errors.
- Preserve seeded determinism where promised. Random choices must use the supplied seed and must not depend on unordered sets, process hash randomization, current time, or filesystem enumeration order.
- Do not store absolute local paths, generated history, favourites, caches, or user media in the repository.

## Python and frontend rules

- Python must remain import-safe when optional voice dependencies are absent.
- Frontend route names may retain `/nova_...` identifiers for compatibility, but visible labels and messages should use NovoLoko.
- Keep Python backend and JavaScript widget behavior in sync.
- Avoid swallowing new exceptions silently. Existing broad compatibility guards may remain, but new code should log actionable errors.
- Use UTF-8 and preserve Windows compatibility for batch files and paths.

## Required checks

Run these before considering work complete:

```bash
python tools/validate_project.py
python -m unittest discover -s tests -v
```

When Node.js is available, the validator also runs `node --check` on every JavaScript file.

## Change reporting

At the end of a task, report:

- files changed;
- behavior changed;
- compatibility risks;
- checks run and results;
- anything that still requires a live ComfyUI Desktop test.
