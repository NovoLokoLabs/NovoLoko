# Contributing to NovoLoko

Use a separate branch for each focused change. Keep pull requests small enough to test and review clearly.

## Development loop

1. Run the baseline validator.
2. Reproduce the problem with the smallest workflow possible.
3. Change only the required backend/frontend files.
4. Add or update a regression test where practical.
5. Run validation and document any required live ComfyUI checks.

## Commit style

Use plain, descriptive commits, for example:

- `fix: keep enhancer output deterministic with fixed seed`
- `fix: preserve optional character input when disconnected`
- `docs: clarify NovoLoko clean installation`
- `feat: append enhancer selection summary output`

## Release discipline

Do not package runtime history, favourites, caches, input images, output images, models, or machine-specific paths. Update the changelog and manifest for release changes.
