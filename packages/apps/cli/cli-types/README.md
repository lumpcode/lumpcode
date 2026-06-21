# @lumpcode/cli-types

TypeScript types and small `defineX` identity helpers for authoring **Lumpcode** lump configuration (`config.ts` / `config.js`) and command modules (`.lumpcode/commands/<name>.ts` or `.js`). Runtime is just identity functions; the value is purely the type hints.

> Use **alongside the Lumpcode CLI** for typed lump config and command modules. Install the CLI with `npm install -g @lumpcode/cli` (Node 22+).

## Install

```bash
npm install --save-dev @lumpcode/cli-types
```

## Usage

`config.ts` (or `config.js`):

```ts
import { defineConfig } from '@lumpcode/cli-types';

export default defineConfig({
  baseBranch: 'main',
  contextListJson: { FILE: 'src/{NAME}.ts' },
  prompt: { promptTemplate: 'Fix @{FILE}', command: 'copilot' },
});
```

Command module (`.lumpcode/commands/my-agent.ts` or `.js`):

```ts
import { defineCommand, defineCommandSetup } from '@lumpcode/cli-types';

export const command = defineCommand(({ prompt }) => ({
  executable: 'my-agent',
  args: ['--message', prompt],
}));

export const setup = defineCommandSetup(async () => ({}));
```

Lumpcode transpiles project **`.ts`** config, hooks, and command modules at load time. Shipped presets under `~/.lumpcode/commands/presets/` remain **`.js` only**.

## What's exported

- **Config helpers** — `defineConfig`, `defineStep`, hook `define*` helpers for lump `config.ts` / `config.js`.
- **Command-module helpers** — `defineCommandModule`, `defineCommand`, `defineCommandSetup`, `defineCommandTeardown`.
- **Types** — lump config and command-module shapes, plus engine types re-exported from `@lumpcode/core`.

Full list: [types.md](../DOCS/types.md).

## Docs

Field reference and hook signatures live in the CLI docs — see [lump-config.md](../DOCS/lump-config.md) and [commands.md](../DOCS/commands.md).
