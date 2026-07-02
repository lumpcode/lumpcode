# `unwrapOrCommandFailure`

## Problem

CLI command handlers call many shared utilities (`validateCurrentLumpProjectRoot`, `readLocalConfig`, `resolveDaemonPaths`, `runProjectPreflight`, and others) that return `Success<T> | Failure<string>`.

When a util fails, the handler must turn that string error into the CLI result envelope (`Failure<CommandOutput>` with a `messages` array). Before this abstraction, every call site repeated the same two-step pattern:

```typescript
const result = await someUtil(...);
if (!result.success) return commandFailure(result.data);
```

That pattern appeared more than twenty times across command modules (`start`, `stop`, `run`, `clean`, `lump-plan`, and others).

## Abstraction

`unwrapOrCommandFailure` lives beside `commandFailure` in `src/utils/commandFailure/main.ts`. It accepts a util result and either returns the success value unchanged or maps the failure string into a command output failure:

```typescript
export function unwrapOrCommandFailure<T>(
    result: Success<T> | Failure<string>,
): Success<T> | Failure<CommandOutput> {
    if (!result.success) {
        return commandFailure(result.data);
    }
    return result;
}
```

Call sites now wrap the awaited util call and early-return on failure:

```typescript
const validationResult = unwrapOrCommandFailure(
    await validateCurrentLumpProjectRoot({ cwd: projectRoot }),
);
if (!validationResult.success) return validationResult;
```

## Why this shape

- **Keeps util boundaries clean.** Core and CLI utils continue to return `Failure<string>`; only the command layer knows about `CommandOutput`.
- **Preserves typing.** On the success path, `validationResult.data` is still typed as the util's success payload.
- **Single place for mapping.** If the envelope shape changes, only `commandFailure` / `unwrapOrCommandFailure` need updating.
- **Explicit control flow.** Handlers that need custom failure shapes (for example `run` when a branch workspace lock is busy) still call `commandFailure` or `failure` directly.

## Files updated

Applied across all command handlers that previously used the repeated guard pattern, including `start`, `stop`, `restart`, `run`, `reset-presets`, `project-setup`, `lump-status`, `lump-plan`, `lump-create`, `daemon-status`, `daemon-log`, `context-status`, and `clean`.
