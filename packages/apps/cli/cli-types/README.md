# @lumpcode/cli-types

TypeScript types and small `defineX` identity helpers for authoring **Lumpcode** lump configuration (`config.js`) and command modules (`.lumpcode/commands/<name>.js`). Runtime is just identity functions; the value is purely the type hints.

> Use **alongside the Lumpcode CLI** for typed `config.js` and command modules. Install the CLI with `npm install -g @lumpcode/cli` (Node 22+).

## Install

```bash
npm install --save-dev @lumpcode/cli-types
```

## Usage

`config.js`:

```js
import { defineConfig } from '@lumpcode/cli-types';

export default defineConfig({
  baseBranch: 'main',
  contextListJson: { FILE: 'src/{NAME}.ts' },
  prompt: { promptTemplate: 'Fix @{FILE}', command: 'copilot' },
});
```

Command module (`.lumpcode/commands/my-agent.js`):

```js
import { defineCommand, defineCommandSetup } from '@lumpcode/cli-types';

export const command = defineCommand(({ prompt }) => ({
  executable: 'my-agent',
  args: ['--message', prompt],
}));

export const setup = defineCommandSetup(async () => ({}));
```

## What's exported

- **Config helpers** — `defineConfig`, `defineStep`, hook `define*` helpers for lump `config.js`.
- **Command-module helpers** — `defineCommandModule`, `defineCommand`, `defineCommandSetup`, `defineCommandTeardown`.
- **Types** — lump config and command-module shapes, plus engine types re-exported from `@lumpcode/core`.

Full list: [types.md](../DOCS/types.md).

## Docs

Field reference and hook signatures live in the CLI docs — see [lump-config.md](../DOCS/lump-config.md) and [commands.md](../DOCS/commands.md).
