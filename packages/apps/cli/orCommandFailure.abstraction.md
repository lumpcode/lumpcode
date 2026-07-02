# `orCommandFailure`

## Problem

CLI command handlers follow a consistent early-return pattern when calling internal utilities that return `Success<T> | Failure<string>` from `@lumpcode/core`:

```typescript
const result = await someUtil({ ... });
if (!result.success) return commandFailure(result.data);
// use result.data
```

This pair appeared **24 times** across 12 command modules (`run`, `start`, `stop`, `restart`, `clean`, `lump-status`, `lump-plan`, `lump-create`, `context-status`, `daemon-status`, `daemon-log`, `reset-presets`, `project-setup`). Each site repeated the same mapping from a string failure to the CLI's `{ messages: [string] }` envelope that `addCommand` expects.

## Abstraction

`orCommandFailure` in `src/utils/commandFailure/main.ts` lifts that mapping into one function:

```typescript
export function orCommandFailure<T>(
    result: Success<T> | Failure<string>,
): Success<T> | Failure<CommandOutput> {
    if (!result.success) return commandFailure(result.data);
    return result;
}
```

Call sites become:

```typescript
const result = await orCommandFailure(await someUtil({ ... }));
if (!result.success) return result;
// use result.data
```

On success the original `Success` object is returned unchanged (reference equality preserved), so downstream code and tests behave the same. On failure the string is wrapped once via the existing `commandFailure` helper.

## Why this shape

- **Stays synchronous** — utilities are already awaited before mapping; no extra async wrapper.
- **Preserves types** — `T` flows through on success; failure narrows to `Failure<CommandOutput>` for direct `return` from handlers.
- **Colocated with `commandFailure`** — both encode the CLI result envelope; handlers import from one place.
- **Does not replace `commandFailure` for ad-hoc errors** — handlers still call `commandFailure(message)` or `failure({ messages: [...] })` when the error is not coming from a `Failure<string>` util (e.g. `run` branch-workspace busy errors).

## Files touched

- Added: `orCommandFailure` + unit tests in `src/utils/commandFailure/`
- Updated: all command handlers that previously used the `if (!x.success) return commandFailure(x.data)` pattern
