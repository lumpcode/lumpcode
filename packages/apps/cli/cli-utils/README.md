# @lumpcode/cli-utils

**Types**, **`define*` helpers**, and **runtime utilities** for authoring Lumpcode lump configs and recipes.

Re-exports all of [`@lumpcode/cli-types`](https://www.npmjs.com/package/@lumpcode/cli-types) plus runtime helpers bundled from `@lumpcode/cli` sources at build time (`cli-types` stays an external dependency at publish).

During the transition both `@lumpcode/cli-types` and `@lumpcode/cli-utils` are supported; new work should prefer `@lumpcode/cli-utils`.

## Install

```bash
npm install @lumpcode/cli-utils
```

## Usage

```ts
import { defineConfig, normalizeSteps, type LumpJsConfig, type StepFn } from '@lumpcode/cli-utils';
```

## Build

From the monorepo root:

```bash
npm run build -w=@lumpcode/core
npm run build -w=@lumpcode/cli-types
npm run build -w=@lumpcode/cli-utils
```

## Runtime exports

- `getContextStatus` — remote marker-commit status for a context
- `makeGitCommitMessageFnFromLumpName` — default `LUMP:<lump> - <context>` messages
- `getGitCommitMessage`, `getLumpCommitPrefixForLump` — commit message helpers
- `readYamlList` — read a YAML file as a flat list (`[]` when missing or not an array)
- `normalizeSteps` — normalize lump `steps` to an array
