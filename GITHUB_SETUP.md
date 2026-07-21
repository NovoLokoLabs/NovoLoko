# GitHub and Codex Setup

## Open locally in Codex

1. Extract the project so the folder is named `ComfyUI-NovoLoko`.
2. Open Codex.
3. Choose **Open folder** and select `ComfyUI-NovoLoko`.
4. Start with `CODEX_START_HERE.md` and `AGENTS.md`.
5. Ask Codex to run the validator before editing anything.

Suggested first instruction:

```text
Read AGENTS.md and CODEX_START_HERE.md. Run the NovoLoko validator and unit tests. Audit the package for high-confidence defects without changing working behavior. Preserve serialized Nova... node IDs, output order, widget order, optional-input safety, and seeded determinism. Report findings before making broad changes.
```

## Put the project on GitHub

Create an empty repository named `NovoLoko` or `ComfyUI-NovoLoko`, then add it as the remote from this folder:

```bash
git remote add origin https://github.com/YOUR_ACCOUNT/NovoLoko.git
git branch -M main
git push -u origin main
```

A private repository is the safest starting point while the rebrand and live ComfyUI testing are still in progress.
