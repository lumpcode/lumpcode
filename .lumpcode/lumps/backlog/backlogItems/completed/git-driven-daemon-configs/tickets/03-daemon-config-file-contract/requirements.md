# Requirements: 03 daemon config file contract

Global contract: [`../../requirements.md`](../../requirements.md) (File schema; Normalize + hash; Meta).

## Standalone value

The on-disk recipe and “ours” meta shape exist and are tested. Later tickets import them; nothing watches git yet.

## In scope

- Util `packages/apps/cli/src/utils/daemonConfigFile/`: `daemonConfigFileSchema` (`.strict()`), `normalizeDaemonConfigFile`, `hashDaemonConfigFile`.
- Editor schema `packages/apps/cli/src/schemas/daemonConfig.schema.json` aligned with the Zod schema.
- Extend `DaemonMeta` / `DaemonMetaWrite` / `readDaemonMeta` Zod with optional `daemonConfigFile: { hash, discoveryBranch, path }`.
- `toMetaWrite` copies `daemonConfigFile` when present. CLI `start` still **omits** it. `desired.json` unchanged.
- Barrel-export from `utils/index.ts`.
- Schema copy: `discoveryBranch` is the dedicated-line bind (`DedicatedLumpLine.effectiveDiscoveryBranch` on `dev`), not a lump name. Description: exact expanded primary; must equal the `origin/<branch>` ref the file was read from.

## Out of scope

- `git ls-tree` / `git show`, supervise loop, start/stop from files.
- Checkout vs `maxParallelRun` launch check (apply-time, ticket 05).

## Acceptance

- [ ] Same normalized hash for JSON vs YAML, key order, omit vs default `cronSetup`/`disabled`, omit vs `[]` include/exclude.
- [ ] Glob `discoveryBranch` and extra keys fail schema.
- [ ] Meta round-trip of `daemonConfigFile`; CLI start metas still omit it.
