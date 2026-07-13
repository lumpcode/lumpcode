# resolveDaemonCommandScope

## Repeated pattern

Daemon companion commands (`stop`, `daemon-status`, `daemon-log`, `restart`) each opened with the same setup sequence:

1. Trim optional `--lumpName` from CLI options.
2. `validateCurrentLumpProjectRoot({ cwd: projectRoot })` with `commandFailure` on miss.
3. `resolveDaemonPaths({ projectRoot, localConfigFolderPath, globalConfigFolderPath, lumpName })` with `commandFailure` on miss.
4. Build `scopeLabel` as `` ` lump "${lumpName}"` `` or `''` for user-facing messages.

That block was copy-pasted across four command handlers with only destructuring differences afterward.

## Why this name

`resolveDaemonCommandScope` describes the shared prelude: resolve whether the operator is in a valid project, which daemon artifact paths apply (global vs per-lump), and the display scope label for messages. It is specific to daemon commands, not generic project validation.

## Files changed

**Added**

- `packages/apps/cli/src/utils/resolveDaemonCommandScope/main.ts`
- `packages/apps/cli/src/utils/resolveDaemonCommandScope/index.ts`
- `packages/apps/cli/src/utils/resolveDaemonCommandScope/unit.test.ts`
- `packages/apps/cli/src/utils/index.ts` (barrel export)

**Refactored**

- `packages/apps/cli/src/commands/stop/main.ts`
- `packages/apps/cli/src/commands/daemon-status/main.ts`
- `packages/apps/cli/src/commands/daemon-log/main.ts`
- `packages/apps/cli/src/commands/restart/main.ts`

## Line count (approximate)

| | Lines |
|---|---|
| Removed from call sites (duplicate validation, path resolution, trim, scopeLabel) | ~53 |
| Added util (`main.ts` + `index.ts` + barrel) | ~27 |
| Added at refactored call sites (single `resolveDaemonCommandScope` call + destructuring) | ~25 |
| **Net reduction (excluding `unit.test.ts`)** | **~1** |
