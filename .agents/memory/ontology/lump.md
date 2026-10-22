# Lump

One campaign: a folder `.lumpcode/lumps/<lumpName>/` whose config says how to find contexts, what steps to run on each, and which agent. Large work too big for one chat, both repetitive edits and planned feature roadmaps. Types: `LumpJsConfig` / `LumpJsonConfig` in `packages/apps/cli/src/types/`; schema `packages/apps/cli/src/schemas/lumpConfig.schema.json`. Core input after CLI adaptation: `RunLumpInput` (`packages/core/src/usages/runLump/`).

A lump needs exactly one context source and exactly one of `prompt` / `steps`. It may come from a recipe factory (see `recipe.md`).

- Lump config precedence: **`config.ts` > `config.js` > `config.json`**; hook `*Fn` paths and custom commands support **`.ts`**; shipped presets stay **`.js`** only; `lump-create` scaffolds JSON/JS only
- Per-lump `disabled`: boolean, zero-arg sync/async fn, or `FilePath` to a module — phase 1 returns `{ skipped: true, reason: 'disabled' }` (exit 0 on manual `run`); daemon `runTick` logs info and continues; no `enable`/`disable` subcommands
