# createDaemonCommandTestProject

## Problem / repeated pattern

Daemon companion command unit tests copy the same multi-step fixture block in `beforeEach`:

1. `createTempTestDirs({ prefix, remote: false })` (or hand-rolled dual `mkdtemp` in supervise)
2. Optional `setDaemonTestGlobalConfigFolder(globalConfigFolderPath)` when tests later start a live daemon
3. `initLocalGitRepo({ cwd: projectRoot })` so `validateCurrentLumpProjectRoot` passes
4. `writeLumpConfigJson({ localConfigFolderPath, lumpName: 'alpha' })`
5. Write `.lumpcode/project.json` with a suite-specific `projectName`
6. Write `README.md` (`# test\n`)
7. Write `.lumpcode/local.json` as `{ mode: 'dedicated', primaryBranch: 'main' }`

`writeLocalJson` / `writeProjectJson` already exist in `testing/multiBranchFixtures.ts`, but these suites still inline `writeJsonFile` for the same paths. The repeated *sequence* is the duplication to extract.

### Where it appears today

| Location | Form today |
| --- | --- |
| `commands/stop/unit.test.ts:31-38` | Full sequence + `setDaemonTestGlobalConfigFolder` |
| `commands/restart/unit.test.ts:27-34` | Same |
| `commands/daemon-status/unit.test.ts:23-30` | Same |
| `commands/daemon-log/unit.test.ts:34-40` | Same without `setDaemonTestGlobalConfigFolder` |
| `commands/supervise/unit.test.ts:15-35` | Hand-rolled `mkdtemp`×2 + same writes; `afterEach` hand-rolled `fs.rm`×2 |

Related but **out of scope**: `commands/start/testing/testHelpers.ts` `setupStartTestRepo` (bare remote + `initBareRemoteAndCheckout`); keep that helper.

## Classification

test helper — every call site is unit-test-only (`commands/*/unit.test.ts`).

Target file(s):
- `packages/apps/cli/src/testing/createDaemonCommandTestProject.ts`
- Re-export from `packages/apps/cli/src/testing/index.ts`

## Fully typed definition

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
    createTempTestDirs,
    initLocalGitRepo,
    writeLumpConfigJson,
} from '../utils';
import { setDaemonTestGlobalConfigFolder } from './daemonTestEnv';
import { writeLocalJson, writeProjectJson } from './multiBranchFixtures';

export type DaemonCommandTestProject = {
    projectRoot: string;
    globalConfigFolderPath: string;
    localConfigFolderPath: string;
    projectName: string;
};

/**
 * Temp dedicated-mode Lumpcode project for daemon companion command unit tests
 * (no bare remote). Teardown with `removeTempTestDirs` from `@lumpcode/cli` utils.
 */
export async function createDaemonCommandTestProject(input: {
    /** Forwarded to `createTempTestDirs` (`remote: false`, `global: true`). */
    prefix: string;
    projectName: string;
    /** Lump config scaffolded under `.lumpcode/lumps/`. Default `'alpha'`. */
    lumpName?: string;
    /**
     * When true (default), call `setDaemonTestGlobalConfigFolder` so
     * `aliveDaemonSpawnFn` works. Set false for suites that never start a
     * detached daemon (e.g. supervise).
     */
    bindDaemonTestEnv?: boolean;
}): Promise<DaemonCommandTestProject> {
    const { prefix, projectName, lumpName = 'alpha', bindDaemonTestEnv = true } = input;

    const dirs = await createTempTestDirs({ prefix, remote: false });
    const globalConfigFolderPath = dirs.globalConfigFolderPath;
    const { projectRoot, localConfigFolderPath } = dirs;

    if (bindDaemonTestEnv) {
        setDaemonTestGlobalConfigFolder(globalConfigFolderPath);
    }

    initLocalGitRepo({ cwd: projectRoot });
    await writeLumpConfigJson({ localConfigFolderPath, lumpName });
    await writeProjectJson(localConfigFolderPath, { projectName });
    await writeLocalJson(localConfigFolderPath, {
        mode: 'dedicated',
        primaryBranch: 'main',
    });
    await fs.writeFile(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');

    return {
        projectRoot,
        globalConfigFolderPath,
        localConfigFolderPath,
        projectName,
    };
}
```

## Before -> after example

```typescript
// Before (stop/unit.test.ts beforeEach)
({ projectRoot, globalConfigFolderPath, localConfigFolderPath } = await createTempTestDirs({
    prefix: 'lump-stop-',
    remote: false,
}));
setDaemonTestGlobalConfigFolder(globalConfigFolderPath);
initLocalGitRepo({ cwd: projectRoot });
await writeLumpConfigJson({ localConfigFolderPath, lumpName: 'alpha' });
await writeJsonFile({
    filePath: path.join(localConfigFolderPath, 'project.json'),
    data: { projectName },
});
await fs.writeFile(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
await writeJsonFile({
    filePath: path.join(localConfigFolderPath, 'local.json'),
    data: { mode: 'dedicated', primaryBranch: 'main' },
});

// After
({ projectRoot, globalConfigFolderPath, localConfigFolderPath } =
    await createDaemonCommandTestProject({
        prefix: 'lump-stop-',
        projectName,
    }));
```

## Affected call sites

- `commands/stop/unit.test.ts:31-38` — replace beforeEach body; drop unused `initLocalGitRepo` / `writeLumpConfigJson` imports if no longer needed; keep `removeTempTestDirs` in afterEach; keep `setDaemonTestGlobalConfigFolder` import only if other tests call it directly (otherwise import via helper only)
- `commands/restart/unit.test.ts:27-34` — same
- `commands/daemon-status/unit.test.ts:23-30` — same
- `commands/daemon-log/unit.test.ts:34-40` — same with `bindDaemonTestEnv: false` (suite never starts a live daemon / never calls `setDaemonTestGlobalConfigFolder` today)
- `commands/supervise/unit.test.ts:15-35` — replace hand-rolled `mkdtemp` beforeEach + `fs.rm` afterEach with `createDaemonCommandTestProject({ prefix: 'lump-supervise-', projectName, bindDaemonTestEnv: false })` + `removeTempTestDirs`; drop direct `initLocalGitRepo` / `writeJsonFile` / `writeLumpConfigJson` / `os` imports if unused

## Estimated lines saved

~40 lines removed across five beforeEach/afterEach blocks and import cleanups; ~32 lines added in `testing/createDaemonCommandTestProject.ts` (+1 barrel export) → ~8–15 net saved. Pays for itself mainly by deleting supervise’s dual-mkdtemp/rm path and centralizing the dedicated daemon fixture contract so new companion-command tests do not re-copy the block.

## Non-goals

- Do not change `setupStartTestRepo` / start suites that need a bare remote
- Do not move `writeLocalJson` / `writeProjectJson` out of `multiBranchFixtures` (reuse them)
- No production code changes; behavior-preserving test refactor only
- No dedicated unit test file for this test helper
- Do not fold “fails when not a Lumpcode project root” cases into this helper (separate pattern)

## Acceptance criteria

- [ ] New file at `packages/apps/cli/src/testing/createDaemonCommandTestProject.ts`; re-exported from `testing/index.ts`
- [ ] All five listed call sites refactored to use it
- [ ] Meaningful net line reduction across call sites (no dedicated helper test file)
- [ ] `npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli` pass; only `packages/apps/cli` touched
