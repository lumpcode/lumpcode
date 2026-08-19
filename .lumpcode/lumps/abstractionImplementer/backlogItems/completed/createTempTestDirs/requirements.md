# Requirements: `createTempTestDirs` — temp fixture directory util

| Field | Value |
| --- | --- |
| **Backlog** | `createTempTestDirs` (priority 8) |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | `packages/apps/cli` only |

## Problem statement and repeated pattern

CLI unit tests and fixture helpers independently implement the same **temp directory scaffold**:

1. `projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), '<prefix>-'))`.
2. Optionally `remoteDir = await fs.mkdtemp(..., '<prefix>-remote-')`.
3. Optionally `globalConfigFolderPath = await fs.mkdtemp(..., '<prefix>-global-')`.
4. `localConfigFolderPath = path.join(projectRoot, '.lumpcode')` then `fs.mkdir(..., { recursive: true })`.
5. In `afterEach` / teardown: `fs.rm(..., { recursive: true, force: true })` for each created root.

The skeleton is identical; only the prefix string and which of `remote` / `global` are needed differ. Git bootstrap (`init --bare`, `initLocalGitRepo`, `remote add`, push), JSON writes, and lump scaffolds stay at the call site (covered by other backlog items such as `initBareRemoteAndCheckout` / `writeLumpConfigJson`).

### Call sites today (representative)

| Location | Prefix pattern | remote | global | Teardown |
| --- | --- | --- | --- | --- |
| `utils/runLumpFromJsConfig/unit.test.ts` | `lump-run-from-js-` | yes | yes | triple `fs.rm` |
| `utils/runLumpFromLumpName/unit.test.ts` | `lump-run-from-name-` | yes | yes | triple `fs.rm` |
| `utils/runProjectPreflight/unit.test.ts` | `lump-run-project-preflight-` | yes | yes | triple `fs.rm` |
| `utils/runPreflight/unit.test.ts` | `lump-preflight-` | yes | yes | triple `fs.rm` (+ ad hoc extra remotes stay local) |
| `utils/validateDaemonLaunch/unit.test.ts` | `lump-validate-daemon-launch-` | yes | yes | triple `fs.rm` |
| `utils/discoverDedicatedLumpsForScanBranch/unit.test.ts` | `lump-discover-dedicated-` / `lump-discover-pattern-` | yes | yes | triple `fs.rm` |
| `utils/resolveEffectiveDiscoveryBranch/unit.test.ts` | `lump-eff-discovery-` | yes | no | project + remote |
| `utils/countOpenLumpBranches/unit.test.ts` | `lump-count-branches-` | yes | no | project + remote |
| `commands/run/unit.test.ts` (3 describes) | `lump-run-cmd-` / `lump-run-ddb-` / `lump-run-signal-` | yes | yes | matching `fs.rm` |
| `commands/lump-plan/unit.test.ts` (ddb describe) | `lump-plan-ddb-` | yes | yes | matching `fs.rm` |
| `commands/stop/unit.test.ts` | `lump-stop-` | no | yes | project + global |
| `commands/restart/unit.test.ts`, `daemon-status/unit.test.ts`, `daemon-log/unit.test.ts` | daemon-command prefixes | no | yes | project + global |
| `commands/start/testing/testHelpers.ts` (`setupStartTestRepo` / `teardownStartTestRepo`) | caller `tmpPrefix` | yes | yes | triple `fs.rm` |
| `testing/multiBranchFixtures.ts` (`scaffoldMultiBranchProject`) | `lump-mbb-` | yes | yes | caller teardown |

Same pattern appears in other command unit tests that mkdtemp `projectRoot` (+ optional global) and `fs.rm` in `afterEach` (`lump-status`, `lump-create`, `context-status`, `clean`, `project-setup`, …). Refactor every call site that matches this scaffold; leave one-off single-dir `mkdtemp` used only for isolated util tests (e.g. `readJsonFile`, `writeJsonFile`) untouched when they are not the multi-root fixture pattern.

## Goals

1. Add `packages/apps/cli/src/utils/createTempTestDirs/` with exported `createTempTestDirs` and `removeTempTestDirs`.
2. Refactor matching call sites above (and siblings with the same scaffold) to use the util, preserving prefixes and which roots are created.
3. Achieve **net line reduction** across `packages/apps/cli` (excluding the new util’s `unit.test.ts`).
4. Add focused unit tests for create/remove (with and without remote/global flags) and that `localConfigFolderPath` exists after create.

## Non-goals

- Git repo bootstrap, bare remotes, or pushing `main` (`initBareRemoteAndCheckout` / `initLocalGitRepo` / `execGit` remain separate).
- Writing `project.json` / `local.json` / lump configs (`writeJsonFile`, `writeLocalJson`, `writeLumpConfigJson`).
- Replacing e2e `createE2eProject` wholesale (it may call `createTempTestDirs` for the mkdtemp portion only if that shrinks lines without changing e2e layout).
- Auto-registering Vitest `beforeEach`/`afterEach` hooks; callers still own lifecycle.
- Moving the util to `@lumpcode/core`.

## Proposed util API

**Directory:** `packages/apps/cli/src/utils/createTempTestDirs/`

```typescript
export type CreateTempTestDirsInput = {
    /** Prefix passed to `fs.mkdtemp` for `projectRoot` as `${prefix}` (callers include trailing `-` today). */
    prefix: string;
    /** When true (default), also create `remoteDir` with `${prefix}remote-` if `prefix` already ends with `-`, else `${prefix}-remote-`. */
    remote?: boolean;
    /** When true (default), also create `globalConfigFolderPath` with the analogous `global-` suffix. */
    global?: boolean;
    /** When true (default), `mkdir` `path.join(projectRoot, '.lumpcode')` recursively. */
    mkdirLocalConfig?: boolean;
};

export type TempTestDirs = {
    projectRoot: string;
    localConfigFolderPath: string;
    remoteDir?: string;
    globalConfigFolderPath?: string;
};

export async function createTempTestDirs(input: CreateTempTestDirsInput): Promise<TempTestDirs>;

export async function removeTempTestDirs(dirs: Pick<TempTestDirs, 'projectRoot' | 'remoteDir' | 'globalConfigFolderPath'>): Promise<void>;
```

### Semantics

**Prefix / sibling naming (pin product shape):**

- `projectRoot` = `fs.mkdtemp(path.join(os.tmpdir(), prefix))` where `prefix` is used exactly as today (callers pass strings like `'lump-run-from-js-'`).
- When `remote: true`, `remoteDir` = `fs.mkdtemp(path.join(os.tmpdir(), `${prefix}remote-`))` — i.e. callers’ existing `'…-remote-'` is expressed as `prefix` already ending in `-` plus the literal `remote-` suffix (same for `global-`).
- `localConfigFolderPath` is always `path.join(projectRoot, '.lumpcode')`.
- When `mkdirLocalConfig` is true (default), create that directory with `{ recursive: true }` before return.
- Omit `remoteDir` / `globalConfigFolderPath` from the result when the corresponding flag is false.

**`removeTempTestDirs`:**

- `fs.rm` each provided path with `{ recursive: true, force: true }`.
- Skip undefined optional roots.
- Do not throw if a path is already gone (`force: true`).

### Caller adaptation

**Full triple (typical `beforeEach` / `afterEach`):**

```typescript
const dirs = await createTempTestDirs({ prefix: 'lump-run-from-js-' });
projectRoot = dirs.projectRoot;
remoteDir = dirs.remoteDir!;
globalConfigFolderPath = dirs.globalConfigFolderPath!;
localConfigFolderPath = dirs.localConfigFolderPath;
// … git / json setup unchanged …

await removeTempTestDirs({ projectRoot, remoteDir, globalConfigFolderPath });
```

**Project + global only (daemon command tests):**

```typescript
const dirs = await createTempTestDirs({ prefix: 'lump-stop-', remote: false });
```

**`setupStartTestRepo`:** replace the three `mkdtemp` lines + `.lumpcode/lumps` mkdir can stay local if it needs `lumps/`; at minimum use `createTempTestDirs` for the three roots and `removeTempTestDirs` in `teardownStartTestRepo`.

**Canonical owner:** only `createTempTestDirs` / `removeTempTestDirs` own the mkdtemp + multi-root `fs.rm` fixture pattern. Callers must not reintroduce parallel private `mkdtemp` triples for the same scaffold.

## Technical approach

| Step | Where | What |
| --- | --- | --- |
| 1 | `utils/createTempTestDirs/{main.ts,index.ts}` | Implement API; barrel-export from `utils/index.ts` |
| 2 | `utils/createTempTestDirs/unit.test.ts` | Cover flags, path suffix shape, mkdir, remove |
| 3 | Unit tests + `testing/multiBranchFixtures.ts` + `commands/start/testing/testHelpers.ts` | Replace matching scaffolds |
| 4 | Spot-check | Confirm git/JSON setup after create still uses `dirs.*` paths |

## Testing strategy

| Level | Coverage |
| --- | --- |
| Unit (`createTempTestDirs/unit.test.ts`) | Default creates project+remote+global+localConfig dir; `remote: false` / `global: false`; `mkdirLocalConfig: false`; `removeTempTestDirs` deletes created roots; prefix suffix shape matches contract |
| Integration (existing suites) | No behavior change: suites that adopt the util keep passing without altering git or config assertions |

## Acceptance criteria

1. `packages/apps/cli/src/utils/createTempTestDirs/` exists with `createTempTestDirs` and `removeTempTestDirs` exported from the CLI utils barrel.
2. All matching multi-root mkdtemp / `fs.rm` fixture scaffolds listed above (and clear siblings) use the util; no duplicate private triple remains for that pattern.
3. Net line count in `packages/apps/cli` decreases excluding `createTempTestDirs/unit.test.ts`.
4. Unit tests cover create/remove behavior and flag combinations.
5. Existing command/util tests that adopt the helper stay green without changing their git or config assertions.
