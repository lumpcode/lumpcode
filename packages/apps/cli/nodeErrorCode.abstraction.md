# nodeErrorCode

## Problem

Across the CLI package, filesystem and process operations catch `unknown` errors and branch on Node.js system error codes such as `ENOENT`, `EEXIST`, and `ESRCH`. The same guard appeared in more than a dozen places:

```typescript
const code =
    error && typeof error === 'object' && 'code' in error
        ? (error as NodeJS.ErrnoException).code
        : undefined;
```

`readDaemonMeta/main.ts` even had a TODO noting this duplication. The pattern is easy to get subtly wrong (for example, assuming `code` is always a string) and adds noise at every call site.

## Abstraction

A small util, `nodeErrorCode`, centralizes extraction of the `code` property from Node.js system errors:

```typescript
export function nodeErrorCode(error: unknown): string | undefined {
    if (error && typeof error === 'object' && 'code' in error) {
        const code = (error as NodeJS.ErrnoException).code;
        return typeof code === 'string' ? code : undefined;
    }
    return undefined;
}
```

Call sites collapse to:

```typescript
const code = nodeErrorCode(error);
if (code === 'ENOENT') { /* ... */ }
```

## Where it is used

- **Utils:** `validateCurrentLumpProjectRoot`, `readLocalConfig`, `readDaemonMeta`, `readDaemonPidIfAlive`, `listRunningProjectDaemons`, `branchWorkspaceLock`
- **Commands:** `project-setup`, `stop`, `logout`
- **E2E harness:** `createE2eProject` (`rmWithRetry`)

The helper lives at `src/utils/nodeErrorCode/` following the package convention (`main.ts`, `index.ts`, `unit.test.ts`) and is barrel-exported from `src/utils/index.ts`.

## Why this abstraction

- **DRY:** One implementation instead of copy-pasted type guards.
- **Safer:** Non-string `code` values return `undefined` instead of leaking through comparisons.
- **Readable:** Intent at call sites is “what errno is this?” rather than “how do I narrow this unknown?”.

Future filesystem or `process.kill` error handling in the CLI should use `nodeErrorCode` rather than reintroducing the inline pattern.
