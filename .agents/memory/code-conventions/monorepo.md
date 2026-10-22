# Monorepo

Packages, what each one publishes, and the stack.

- npm workspaces (**not** pnpm): `packages/core` (`@lumpcode/core`, Apache 2.0 — `runLump` executes one agent loop per invocation), `packages/apps/cli` (`@lumpcode/cli`, Apache 2.0 — ncc bundle from `root.ts` only, **no programmatic library entry**; primary user install), `packages/apps/cli/cli-types` (`@lumpcode/cli-types`, published — canonical types + `define*`), `packages/apps/cli/cli-utils` (`@lumpcode/cli-utils`, published — single root barrel re-exporting `cli-types` + runtime helpers; utils bundled from CLI src at build, `cli-types` external at publish), `packages/recipes` (`@lumpcode/recipes`, published — single root barrel: recipes + kit + recipe types; monorepo imports `@lumpcode/cli-utils` only), `packages/apps/website` (private — the public site; build and deploy in `.agents/memory/writing/website.md`), `packages/libs/ui` (private WIP)
- Authoring stack: `cli-types` and `cli-utils` coexist on npm; prefer `@lumpcode/cli-utils` for new consumer-facing types (`cli-types` soft-aligned until a later deprecation); `.lumpcode/lumps` remain on `cli-types` until the docs branch updates them
- Core layout: `types/` (barrel via `index.ts`), `usages/runLump/`, `helpers/`, `utils/`
- `@lumpcode/core` must not depend on `zod` (dropped; `ContextStatus` is a plain const tuple) — rollup-external zod without a package.json dep broke project-local recipe configs that resolve published core from `node_modules` (global CLI ncc hid it)
- Stack: TypeScript, Commander.js, Zod (CLI only), Vitest; agent-agnostic (Claude, Codex, Aider, Copilot CLI, etc.)
