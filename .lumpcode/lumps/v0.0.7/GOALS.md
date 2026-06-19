# v0.0.7 goals

## Main feature

- **TypeScript lump config** — Allow a lump to use `config.ts` in addition to `config.js` / `config.json`.

## QOL

- **`projectBaseBranch` fallback** — When `local.json` `projectBaseBranch` is missing or does not exist, allow a default in `project.json` via `projectBaseBranch`. Resolution order:
  1. Lump `baseBranch`
  2. `local.json` `projectBaseBranch`
  3. `project.json` `projectBaseBranch`

## Docs

- Add relevant **keywords** to npm packages (`@lumpcode/core`, `@lumpcode/cli`, `@lumpcode/cli-types`, etc.).
- Add the **repository** field to publishable npm `package.json` files.
- Update the root `README.md` and `packages/apps/cli/README.md` to highlight that Lumpcode is easy and straightforward to use, while remaining configurable and powerful.
