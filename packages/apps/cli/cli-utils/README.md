# @lumpcode/cli-utils

Private monorepo workspace — **not published to npm yet**. Rollup re-exports curated runtime helpers from `@lumpcode/cli` sources (same pattern as `@lumpcode/cli-types`).

Source of truth stays under `packages/apps/cli/src/utils/`. The CLI does not depend on this package.

## Build

From the monorepo root:

```bash
npm run build -w=@lumpcode/core
npm run build -w=@lumpcode/cli-utils
```

## Current exports

- `getContextStatus` — remote marker-commit status for a context
- `makeGitCommitMessageFnFromLumpName` — default `LUMP:<lump> - <context>` messages
- `getGitCommitMessage`, `getLumpCommitPrefixForLump` — commit message helpers
- `readYamlList` — read a YAML file as a flat list (`[]` when missing or not an array)

`planLumpFromJsConfig` remains CLI-only for now (heavy runner dependencies).

Add new helpers by extending `src/utils.ts` with a re-export from the CLI util path.
