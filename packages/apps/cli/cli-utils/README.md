# @lumpcode/cli-utils

Types, `defineConfig` and other `define*` helpers, and small runtime utilities for writing [Lumpcode](https://www.npmjs.com/package/@lumpcode/cli) lumps in TypeScript or JavaScript.

It includes everything in [`@lumpcode/cli-types`](https://www.npmjs.com/package/@lumpcode/cli-types); prefer this package for new configs.

## Install

Add it to your project (not globally) so a worker clone gets it from `npm install`:

```bash
npm install --save-dev @lumpcode/cli-utils
```

Docs: [Write a lump](https://www.lumpcode.com/docs/author/write-a-lump) · [Types](https://www.lumpcode.com/docs/config/types) · [Examples](https://www.lumpcode.com/docs/examples/overview).

## Usage

```ts
import {
  defineConfig,
  normalizeSteps,
  type CursorPresetLumpVariables,
  type CursorPresetStepVariables,
  type LumpJsConfig,
  type StepFn,
} from '@lumpcode/cli-utils';

export default defineConfig<
  CursorPresetLumpVariables & { myHookFlag: boolean },
  CursorPresetStepVariables & { myHookFlag: boolean }
>({
  baseBranch: 'main',
  command: 'cursor',
  lumpVariables: { model: 'auto', myHookFlag: true },
  steps: [{ promptTemplate: 'Do the work.', stepVariables: { newChat: true } }],
});
```

`defineConfig` (and the other variable-carrying `define*` helpers) take independent generics `<V, SV>` for lump and step variable bags. Preset option contracts (`CursorPreset*`, `CopilotPreset*`, `ClaudeCodePreset*`, `OpenCodePreset*`, `CodexPreset*`, `PresetSessionStepVariables`, …) are closed TypeScript types — intersect with your own keys via `& Extra`.

## Build

From the monorepo root:

```bash
npm run build -w=@lumpcode/core
npm run build -w=@lumpcode/cli-types
npm run build -w=@lumpcode/cli-utils
```

## Runtime exports

- `getContextStatus` — remote marker-commit status for a context (locked one-shot fetch)
- `getContextStatuses` — batch status map (one locked fetch, then local reads)
- `makeGitCommitMessageFnFromLumpName` — default `LUMP:<lump> - <context>` messages
- `getGitCommitMessage`, `getLumpCommitPrefixForLump` — commit message helpers
- `readYamlList` — read a YAML file as a flat list (`[]` when missing or not an array)
- `normalizeSteps` — normalize lump `steps` to an array
