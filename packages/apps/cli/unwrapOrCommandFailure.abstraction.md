# unwrapOrCommandFailure

## Problem

CLI command handlers call many shared utilities (`validateCurrentLumpProjectRoot`, `resolveDaemonPaths`, `readLocalConfig`, `getJsConfigFromLumpName`, `runProjectPreflight`, and others) that return `Success<T> | Failure<string>` from `@lumpcode/core`.

When a utility fails, handlers must surface the error through the CLI result envelope: `{ messages: string[] }` wrapped in `Failure<CommandOutput>`. That conversion was duplicated in every handler as:

```ts
const result = await someUtil(...);
if (!result.success) return commandFailure(result.data);
```

This pattern appeared more than twenty times across `src/commands/`, always pairing the same guard with `commandFailure`.

## Abstraction

`unwrapOrCommandFailure` lives beside `commandFailure` in `src/utils/commandFailure/main.ts`. It accepts any `Success<T> | Failure<string>` and:

- returns the original `Success<T>` unchanged on success
- maps `Failure<string>` to `Failure<CommandOutput>` via `commandFailure` on failure

```ts
export function unwrapOrCommandFailure<T>(
    result: Success<T> | Failure<string>,
): Success<T> | Failure<CommandOutput> {
    if (!result.success) return commandFailure(result.data);
    return result;
}
```

Handlers now write:

```ts
const result = await unwrapOrCommandFailure(await someUtil(...));
if (!result.success) return result;
// result.data is typed as T
```

## Why this shape

- **Single conversion point** — the string-to-envelope mapping stays in one function next to `commandFailure`.
- **Preserves typing** — after the guard, `result.data` remains the util's success payload (`LocalConfig`, `ResolvedDaemonPaths`, `LumpJsConfig`, etc.).
- **Fits existing flow** — handlers still early-return on failure; no exceptions or wrapper types that hide the `Success`/`Failure` model.
- **Narrow scope** — `commandFailure` remains for non-util errors (e.g. `run` when `runLumpFromJsConfig` returns a non-string failure). Only `Failure<string>` util results use the unwrap helper.

## Files touched

- Added `unwrapOrCommandFailure` and unit tests in `src/utils/commandFailure/`.
- Replaced the repeated guard in command handlers: `stop`, `start`, `run` (preflight and config load), `restart`, `project-setup`, `lump-status`, `lump-plan`, `lump-create`, `daemon-status`, `daemon-log`, `context-status`, `clean`, and `reset-presets`.
