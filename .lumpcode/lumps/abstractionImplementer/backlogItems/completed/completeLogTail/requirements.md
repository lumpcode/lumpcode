# completeLogTail

## Problem / repeated pattern

Three commands tail a file the same way. Each declares the same `--lines` and `--noFollow` options, calls `tailFile` with `follow: !noFollow` and `lines ?? 10`, maps a string failure into `{ messages: [message] }`, returns a one-line "Stopped following …" success when following, and on `--noFollow` returns the captured lines both as `messages` and inside `data`. `daemon-log` and `supervisor-log` also `access` the path first so a missing file gets a command-specific sentence instead of `tailFile`'s "File not found".

The path each command tails is different (daemon scope, supervisor log path, transcript resolver). The tail result handling is the same logic.

- `packages/apps/cli/src/commands/daemon-log/main.ts:18-24` — `--lines` / `--noFollow` schema
- `packages/apps/cli/src/commands/daemon-log/main.ts:51-52` and `:71-103` — default lines, `access`, `tailFile`, follow vs snapshot result (`data.daemonId`)
- `packages/apps/cli/src/commands/supervisor-log/main.ts:15-21` — same schema fields
- `packages/apps/cli/src/commands/supervisor-log/main.ts:48-49` and `:58-90` — same tail block (`data.projectName`)
- `packages/apps/cli/src/commands/transcript/main.ts:28-34` — same schema fields (plus `--list`, which stays)
- `packages/apps/cli/src/commands/transcript/main.ts:126-150` — same tail block. Keep the `--list` guards that read `lines` / `noFollow` before the tail (`:81-82`, `:87-91`). Transcript has no pre-`access`; a missing file stays `tailFile`'s failure string.

`tailFile` already exists and must stay the low-level reader. It does not know command messages or the `data` payload.

## Classification

util — call sites are production command handlers (`commands/daemon-log`, `commands/supervisor-log`, `commands/transcript`).

Target file(s):

- util: `packages/apps/cli/src/utils/completeLogTail/main.ts` (+ `index.ts`, `unit.test.ts`, barrel export in `packages/apps/cli/src/utils/index.ts`)

## Fully typed definition

```typescript
import { access } from 'node:fs/promises';
import { spawn as nodeSpawn } from 'node:child_process';
import * as z from 'zod';

import { failure, success, type Failure, type Success } from '@lumpcode/core';

import { DEFAULT_TAIL_LINES, tailFile } from '../tailFile';

/** Shared `--lines` / `--noFollow` fields for daemon-log, supervisor-log, and transcript. */
export const followableTailOptionFields = {
    lines: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Number of initial lines to show (omitted = 10; 0 = whole file)'),
    noFollow: z.boolean().optional().describe('Print lines and exit instead of following live'),
};

/**
 * Optional missing-file message, then `tailFile`.
 * Follow mode returns `followedMessage` and no `data`.
 * `--noFollow` returns the captured lines as `messages` and as `data(lines)`.
 * Omitted `lines` means `DEFAULT_TAIL_LINES` (10). `lines: 0` is the whole file.
 */
export async function completeLogTail<TData>(input: {
    filePath: string;
    lines?: number;
    noFollow: boolean;
    spawnFn?: typeof nodeSpawn;
    /** When set, any `access` failure returns this message and does not call `tailFile`. */
    missingMessage?: string;
    followedMessage: string;
    data: (outputLines: string[]) => TData;
}): Promise<Success<{ messages: string[]; data?: TData }> | Failure<{ messages: string[] }>> {
    const lines = input.lines ?? DEFAULT_TAIL_LINES;
    if (input.missingMessage !== undefined) {
        try {
            await access(input.filePath);
        } catch {
            return failure({ messages: [input.missingMessage] });
        }
    }

    const tailResult = await tailFile({
        filePath: input.filePath,
        lines,
        follow: !input.noFollow,
        spawnFn: input.spawnFn,
    });
    if (!tailResult.success) {
        return failure({ messages: [tailResult.data] });
    }
    if (!input.noFollow) {
        return success({ messages: [input.followedMessage] });
    }
    const outputLines = 'lines' in tailResult.data ? tailResult.data.lines : [];
    return success({
        messages: outputLines,
        data: input.data(outputLines),
    });
}
```

Spread `followableTailOptionFields` into each command's `baseCommandOptionsSchema.extend({ ... })`. Keep every other option on that schema.

## Before -> after example

```typescript
// Before (commands/daemon-log/main.ts)
const lines = input.options.lines ?? DEFAULT_TAIL_LINES;
const noFollow = input.options.noFollow === true;
// ... resolve daemon scope to logFilePath, daemonId, projectName, scopeLabel ...
try {
    await access(logFilePath);
} catch {
    return failure({
        messages: [
            `No daemon log file for "${projectName}"${scopeLabel} at ${logFilePath}. Start the daemon first or check --daemonId.`,
        ],
    });
}

const tailResult = await tailFile({
    filePath: logFilePath,
    lines,
    follow: !noFollow,
    spawnFn,
});
if (!tailResult.success) {
    return failure({ messages: [tailResult.data] });
}
if (!noFollow) {
    return success({
        messages: ['Stopped following daemon log.'],
    });
}
const outputLines = 'lines' in tailResult.data ? tailResult.data.lines : [];
return success({
    messages: outputLines,
    data: {
        logFilePath,
        lines: outputLines,
        daemonId,
    },
});

// After
return completeLogTail({
    filePath: logFilePath,
    lines: input.options.lines,
    noFollow: input.options.noFollow === true,
    spawnFn,
    missingMessage: `No daemon log file for "${projectName}"${scopeLabel} at ${logFilePath}. Start the daemon first or check --daemonId.`,
    followedMessage: 'Stopped following daemon log.',
    data: (outputLines) => ({
        logFilePath,
        lines: outputLines,
        daemonId,
    }),
});
```

## Affected call sites

- `packages/apps/cli/src/commands/daemon-log/main.ts:18-24` — replace the `lines` / `noFollow` zod fields with `...followableTailOptionFields`
- `packages/apps/cli/src/commands/daemon-log/main.ts:51-52` and `:71-103` — replace defaulting, `access`, and the `tailFile` result with `completeLogTail` (keep logger + `resolveDaemonCommandScope`)
- `packages/apps/cli/src/commands/supervisor-log/main.ts:15-21` — same schema spread
- `packages/apps/cli/src/commands/supervisor-log/main.ts:48-49` and `:58-90` — `completeLogTail` with the supervisor missing sentence and `followedMessage: 'Stopped following supervisor log.'`; `data` returns `{ logFilePath, lines, projectName }` (keep project-root validation, `getProjectName`, and `supervisorLogPath`)
- `packages/apps/cli/src/commands/transcript/main.ts:28-34` — same schema spread; leave `--list` and the other transcript options
- `packages/apps/cli/src/commands/transcript/main.ts:126-150` — `completeLogTail` with no `missingMessage`, `followedMessage: 'Stopped following transcript.'`, and `data` returning `{ lumpName, discoveryBranch, stamp, filePath, lines }` from `resolved.data`. Keep the `--list` / `--lumpName` / `--json` checks above this call.

## Estimated lines saved

~78 lines removed at the three call sites (schema fields plus the tail blocks), ~57 added (`main.ts`, `index.ts`, one barrel line). ~21 net saved. Excludes `unit.test.ts`.

## Non-goals

- Do not change `tailFile` (spawn args, signal handling, default of 10, `lines: 0` means the whole file).
- Do not unify path resolution: `resolveDaemonCommandScope`, `supervisorLogPath`, and `resolveLumpTranscriptFile` stay in the commands.
- Do not change user-facing sentences, option descriptions, or the follow-mode payload (no `data` until `--noFollow`).
- Do not touch transcript `--list` behavior.
- Behavior-preserving refactor. Only `packages/apps/cli`.

## Acceptance criteria

- [ ] New file(s) at target path(s); util re-exported from `utils/index.ts`
- [ ] All listed call sites refactored to use it
- [ ] Meaningful net line reduction across call sites (excluding util `unit.test.ts`)
- [ ] util only: unit test in `utils/completeLogTail/unit.test.ts` covering missing-file message (no `tailFile` call), `tailFile` failure mapped to `{ messages }`, follow mode returning only `followedMessage`, and `--noFollow` returning lines as both `messages` and `data` (real temp file or a `spawnFn` mock, same style as `tailFile/unit.test.ts`)
- [ ] `npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli` pass; only `packages/apps/cli` touched
