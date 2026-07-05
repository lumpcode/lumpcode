# toCommandResult

## Problem

CLI command handlers repeatedly bridge two result types:

- Internal utilities return `Success<T> | Failure<string>` (plain error messages).
- Command handlers must return `Success<Output> | Failure<CommandOutput>`, where failures use `{ messages: string[] }`.

The same two-line pattern appeared across many commands:

```ts
const result = await someUtil(...);
if (!result.success) return commandFailure(result.data);
```

This showed up for project validation, local config loading, daemon path resolution, lump config loading, planning, and preset installation.

## Abstraction

Added `toCommandResult` in `packages/apps/cli/src/utils/toCommandResult/`:

```ts
export function toCommandResult<T>(
    result: Success<T> | Failure<string>,
): Success<T> | Failure<CommandOutput> {
    if (!result.success) {
        return commandFailure(result.data);
    }
    return result;
}
```

Call sites now read:

```ts
const result = toCommandResult(await someUtil(...));
if (!result.success) return result;
```

Success payloads are unchanged; only string failures are wrapped via the existing `commandFailure` helper.

## Files updated

- New util: `utils/toCommandResult/` (barrel-exported from `utils/index.ts`)
- Command handlers: `stop`, `start`, `run`, `restart`, `reset-presets`, `project-setup`, `lump-status`, `lump-plan`, `lump-create`, `daemon-status`, `daemon-log`, `context-status`, `clean`

Handlers that need custom failure shaping (for example `run` with `runLumpFromJsConfigFailureMessage`) still call `commandFailure` directly for those cases.

## Why this abstraction

- **Broad reuse**: One helper covers every `Failure<string>` → command output conversion, not a single duplicated call site.
- **Type-safe**: Preserves the success generic `T` through the guard; no casting.
- **Minimal scope**: Builds on existing `commandFailure`; does not change CLI logging or `addCommand` behavior.
- **Clear intent**: The name documents that the result is being adapted for command-handler return types.

Alternatives considered:

- **`requireLumpProjectRoot`**: Only deduplicates project-root validation (10 call sites), not config/daemon/plan failures.
- **`optionalTrimmedString`**: Useful for optional CLI string options (6 call sites) but narrower impact.
- **Inlining `commandFailure` at every site**: Already the status quo; this change removes noise without hiding behavior.
