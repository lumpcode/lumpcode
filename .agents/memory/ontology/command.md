# Command (agent)

What a step runs. A lump `command` is a registered tag (`cursor`, `copilot`, `claude-code`, `opencode`, `codex`, or a project module name), a lump-relative `.ts` / `.js` module path, or an inline `CommandFn` (`packages/core/src/types/CommandFn.ts`) returning `{ executable, args, env? }` or nothing to skip. Never a shell line. A command module exports `command` plus optional `setup` / `teardown` (`CommandModule` in `packages/apps/cli/src/types/CommandModule.ts`). Shipped presets live in `packages/apps/cli/src/presets/commands/`. Rules: `domain/commands-and-presets.md`.
