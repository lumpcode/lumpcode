# @lumpcode/cli-utils (internal)

Private monorepo workspace — **not published to npm yet**. Rollup re-exports curated runtime helpers from `@lumpcode/cli` sources (same pattern as `@lumpcode/cli-types`).

Source of truth stays under `packages/apps/cli/src/utils/`. The CLI does not depend on this package.

## Build

From the monorepo root:

```bash
npm run build -w=@lumpcode/core
npm run build -w=@lumpcode/cli-utils
```

## Current exports

- `getContextStatus` (via `src/utils.ts`)

Add new helpers by extending `src/utils.ts` with a re-export from the CLI util path.
