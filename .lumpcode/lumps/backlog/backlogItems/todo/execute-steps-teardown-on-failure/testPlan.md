# Test plan: execute-steps-teardown-on-failure

| Field | Value |
| --- | --- |
| **Backlog** | `execute-steps-teardown-on-failure` |
| **Kind** | Runtime fix (`try/finally` teardowns on `stepWalkFailure` / abort) + failure `reason` typing + CLI warn |
| **Primary packages under test** | `@lumpcode/core` (`executeStepsForContextList`, `runLump` failure typing) |
| **Secondary** | `@lumpcode/cli` (`runLumpFromJsConfig` warn on `workspaceTeardownFailed`) |
| **Not under test** | `@lumpcode/recipes`; agent kill on timeout/abort (covered by `kill-spawned-command-on-timeout-abort`); daemon stop-on-teardown-fail; E2E; `TeardownFn` / `TeardownWorkspaceFn` signature changes; git push “log only” semantics |

Source of truth: [requirements.md](./requirements.md). This plan is the source of truth for the `testImpl` stage.

---

## 1. Goals of the test suite

Prove that after implementation:

1. After successful workspace setup, `teardownWorkspaceFn` always runs on any exit (command `stepWalkFailure`, abort, git add failure, unexpected throw, success).
2. After each context’s walk attempt, `teardownFn` always runs; on `stepWalkFailure` that context skips git add/commit, remaining contexts are not started, and push is skipped.
3. Soft-fail `teardownFn` errors (catch + `logger.error`); they never block git and never become the returned `Failure`.
4. Lone workspace-teardown command failure returns `reason: 'workspaceTeardownFailed'`; when a step-walk failure was already recorded, the returned reason stays `'stepWalkFailed'`.
5. Returned step-walk failures (command fail / abort) stamp `reason: 'stepWalkFailed'`.
6. `runLump` preserves `data.reason` when rewriting `data.message`.
7. CLI `runLumpFromJsConfig` warns only when `reason === 'workspaceTeardownFailed'`, and still returns `Failure` with `kind: 'message'`.
8. Success path order remains: walk → `teardownFn` → git add/commit → (other contexts) → push → workspace teardown.

Docs (`AGENTS.md`, `concepts.md`) are **implementation-stage acceptance**, not automated in `testImpl`.

---

## 2. Testing approach

| Level | Required? | Mechanism |
| --- | --- | --- |
| **Unit (core)** | Yes — primary | Real temp git repos + side-effect markers (`executionOrder` / call counters); Vitest; stub git/workspace fns like today’s suite |
| **Unit (cli)** | Yes | Mock `core.runLump` in existing `runLumpFromJsConfig` suite; spy logger `warn` |
| **Integration / E2E** | No | Requirements: none for this item |

### Prefer side effects over deep mocks

Match `executeStepsForContextList/unit.test.ts` and `timeoutAbort.unit.test.ts`: real `projectRoot` temp repos, stub `git*CommandFn` / workspace fns that record calls, real failing commands (`sh -c 'exit 1'` or abort via `AbortSignal`). Do **not** mock `execBinary` for these cases.

### Prefer update over new when a host exists

Only add a new `it` when no existing case owns the same setup/path. Substantiated update hosts (do **not** duplicate with parallel new tests):

| Host (today) | Becomes |
| --- | --- |
| `unit.test.ts` — “stops the step walk when the command fails and continueOnError is not set” | **T1** (teardowns + `reason` + no git) |
| `timeoutAbort.unit.test.ts` — **S2** (timeout without `continueOnError`) | **T2** (same teardown/`reason`/no-git asserts) |
| `timeoutAbort.unit.test.ts` — **S3** (abort mid-walk) | **T3** |
| `timeoutAbort.unit.test.ts` — **S4** (already-aborted signal) | **T4** |

All other IDs (F*, W*, G*, O*, M*, R*, C*) are **new** `it`s — no good existing host.

### Red → green during `testImpl` (skip both new and updated)

1. Write/extend all cases against the **post-implementation** contract (teardowns run, `reason` stamped, etc.).
2. Mark **every** case for this item with `it.skip` / `describe.skip` (or Vitest equivalent) during `testImpl` — both **new** tests **and** **updated** existing tests — so the suite stays green while product code is unchanged.
3. Do **not** implement product behavior in `testImpl` beyond exporting type stubs if needed so imports compile (prefer asserting on returned `data.reason` so missing field fails naturally once unskipped).
4. During **implementation**, unskip the cases as the behavior lands (or unskip all at once when the fix is complete). Do not leave the updated hosts permanently skipped.

### Failure typing stub (only if needed)

If tests cannot compile because `Failure<{ message: string }>` rejects `reason`, either:

- cast expectations loosely (`expect((result.data as { reason?: string }).reason).toBe(...)`), or
- add exported types `ExecuteStepsFailureReason` / `ExecuteStepsFailureData` as stubs used only by types, without implementing control flow.

Prefer casting in tests over inventing runtime stubs.

---

## 3. File layout (implementation details)

| Path | Role |
| --- | --- |
| `packages/core/src/helpers/executeStepsForContextList/unit.test.ts` | **Update** T1 in place; **Add** F*/W*/G*/O*/M* (new `it`s). All T1 + new cases `it.skip` until implementation |
| `packages/core/src/helpers/executeStepsForContextList/timeoutAbort.unit.test.ts` | **Update** S2→T2, S3→T3, S4→T4 in place (markers + `reason` + no git). `it.skip` those three until implementation |
| `packages/core/src/usages/runLump/unit.test.ts` | **Add** (new file): R1/R2 — preserve `reason` when rewriting message. File/`it.skip` until implementation |
| `packages/apps/cli/src/utils/runLumpFromJsConfig/unit.test.ts` | **Add** C1–C3 (new `it`s in existing suite). `it.skip` until implementation |

Optional split if `unit.test.ts` grows too large: colocate a sibling `teardownOnFailure.unit.test.ts` next to `timeoutAbort.unit.test.ts` with the same stubs (`initTestGitRepo`, stub git fns). Prefer extending the existing file unless it becomes unwieldy.

Run:

```bash
npm run test -w=@lumpcode/core
npm run test -w=@lumpcode/cli
```

---

## 4. Shared test data / fixtures

### 4.1 Minimal execute-steps harness

Reuse patterns already in `executeStepsForContextList/unit.test.ts`:

```ts
const stubBranchFn: BranchFn = async () => 'lump/test/ctx';
const stubGitCommitMessage = () => 'LUMP:ctx';
// git add / commit / push: record calls via closures, return harmless echo commands
setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot })
```

Temp repo: `mkdtemp` under `tmpdir()`, `initTestGitRepo` with local `user.name` / `user.email`, tear down with `rm(..., { recursive: true, force: true })`.

### 4.2 Call-order / marker recorder

```ts
const events: string[] = [];
const teardownFn = async ({ currentContextIndex }) => {
  events.push(`teardownFn:${currentContextIndex}`);
};
const teardownWorkspaceFn = async () => {
  events.push('teardownWorkspaceFn');
  return ''; // or a failing shell command for W* cases
};
const gitAddCommandFn = () => {
  events.push('gitAdd');
  return 'echo git-add';
};
const gitCommitCommandFn = () => {
  events.push('gitCommit');
  return 'echo git-commit';
};
const gitPushCommandFn = () => {
  events.push('gitPush');
  return 'echo git-push';
};
```

For soft-fail `teardownFn` throw:

```ts
teardownFn: async () => {
  events.push('teardownFn');
  throw new Error('teardown boom');
}
```

Capture `logger.error` messages in an array (same pattern as existing commit/push logger tests).

### 4.3 Failing step command

```ts
{ commandFn: () => ({ executable: 'sh', args: ['-c', 'exit 1'] }) }
```

On Windows CI, prefer `process.execPath` + `['-e', 'process.exit(1)']` if `sh` is unreliable in this suite — existing dynamic-steps cases already use `sh`; keep consistency with that file unless flaky on win32 (then `it.skipIf` or node `-e`).

### 4.4 Abort

Reuse `timeoutAbort.unit.test.ts` long-lived fixture + `AbortController`:

- abort mid-run after ready file, or
- abort before first command.

Assert teardowns via markers; process death already covered by that suite.

### 4.5 Failing workspace teardown command

`teardownWorkspaceFn` returns a shell string that fails, e.g. `'exit 1'` or `'false'`, executed via existing `execAsync` path (`cwd: workspacePath`). Empty string `''` means “no teardown command” (today’s success path) — use a non-empty failing command for `workspaceTeardownFailed`.

### 4.6 Git add failure

```ts
gitAddCommandFn: () => 'exit 1' // or `false`
```

Walk must succeed first (echo steps) so the failure is post-walk.

### 4.7 Multi-context list

```ts
contextList: [
  { name: 'ctx-a', variables: {} },
  { name: 'ctx-b', variables: {} },
]
```

Steps that fail only for the second context: branch on `context.name` inside `commandFn` / `promptFn`, or use a `StepFn` that returns `exit 1` when `context.name === 'ctx-b'`.

### 4.8 CLI mock `runLump` failure shapes

```ts
core.failure({
  message: 'Failed to teardown the workspace: …',
  reason: 'workspaceTeardownFailed',
})

core.failure({
  message: 'Failed to run the command: …',
  reason: 'stepWalkFailed',
})
```

Inject a logger with `warn: (msg) => warnCalls.push(msg)` via whatever `callRunLumpFromJsConfig` / fixture already accepts (extend helper if logger is not currently injectable — prefer passing `logger` on the run input if the API supports it; otherwise spy the module logger used by `runLumpFromJsConfig`).

---

## 5. Test cases

Each case: **ID**, **setup/data**, **expectation**, **where**.

### 5.1 Core — step-walk failure teardown + reason (**update** existing hosts)

Do **not** add parallel new tests for these paths. Update the named hosts in place; keep original asserts (walk stop / process death) and add teardown/`reason`/no-git.

| ID | Mode | Host / case | Data | Expectation |
| --- | --- | --- | --- | --- |
| T1 | **Update** | `unit.test.ts` — “stops the step walk when the command fails and continueOnError is not set” | Same as today (`exit 1` + second step never reached) + markers on `teardownFn` / `teardownWorkspaceFn` / git fns | Keep `success: false`; add `data.reason === 'stepWalkFailed'`; message still mentions failed command; **`teardownFn` once**; **`teardownWorkspaceFn` once**; **no** `gitAdd` / `gitCommit` / `gitPush` |
| T2 | **Update** | `timeoutAbort.unit.test.ts` — **S2** (timeout without `continueOnError`) | Same long-lived + timeout fixture + markers | Keep walk-stop + tree-dead asserts; add both teardowns ran; `reason: 'stepWalkFailed'`; no git add/push |
| T3 | **Update** | `timeoutAbort.unit.test.ts` — **S3** (abort mid-walk) | Same abort-after-ready fixture + markers | Keep walk-stop + tree-dead; add both teardowns; `reason: 'stepWalkFailed'`; no git add/push |
| T4 | **Update** | `timeoutAbort.unit.test.ts` — **S4** (already-aborted signal) | Same aborted-up-front fixture + markers | Keep `success: false` / no orphans; add both teardowns; `reason: 'stepWalkFailed'`; no git |

**Where:** T1 → `packages/core/src/helpers/executeStepsForContextList/unit.test.ts`; T2–T4 → `packages/core/src/helpers/executeStepsForContextList/timeoutAbort.unit.test.ts`.

**`testImpl`:** Convert these four hosts to `it.skip` (with the new asserts already written). Unskip during implementation.

### 5.2 Core — soft `teardownFn` errors (**new**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| F1 | `teardownFn` throws on success path | Echo step succeeds; `teardownFn` throws; capture `logger.error` | `success: true`; `gitAdd` / `gitCommit` / `gitPush` / `teardownWorkspaceFn` all ran; error logged (message includes throw / “teardown”); Result is **not** a Failure |
| F2 | `teardownFn` throws after step-walk failure | `exit 1` step; `teardownFn` throws | Still `reason: 'stepWalkFailed'`; `teardownWorkspaceFn` still ran; throw logged; throw does **not** replace Result |

**Where:** `packages/core/src/helpers/executeStepsForContextList/unit.test.ts` (new `it.skip` cases).

### 5.3 Core — workspace teardown failure + precedence (**new**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| W1 | Success walk + failing teardown command | Echo steps; `teardownWorkspaceFn` → `'exit 1'` (or equivalent) | `success: false`; `reason: 'workspaceTeardownFailed'`; message mentions teardown; **`gitPush` was attempted** (event present) before teardown |
| W2 | Step-walk failed then teardown also fails | `exit 1` step; `teardownWorkspaceFn` → failing command | Returned `reason` remains `'stepWalkFailed'` (not `workspaceTeardownFailed`); both teardowns attempted; no push |
| W3 | Soft `teardownFn` error + failing workspace teardown | Success walk; `teardownFn` throws; workspace teardown command fails | `reason: 'workspaceTeardownFailed'`; git still ran; `teardownFn` error logged |

**Where:** `packages/core/src/helpers/executeStepsForContextList/unit.test.ts` (new `it.skip` cases).

### 5.4 Core — post-setup exits still tear down workspace (**new**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| G1 | Git add failure after successful walk | Echo step; `gitAddCommandFn` → `'exit 1'` | `success: false`; message mentions add/context (existing wording); **`teardownWorkspaceFn` ran**; `reason` **omitted** (message-only Failure — not `stepWalkFailed` / `workspaceTeardownFailed`) |
| G2 | Optional: unexpected throw inside walk hooks | If easy: `postCommandExecFn` throws after success command | `teardownFn` (if walk attempt completed enough to enter finally) and/or outer `teardownWorkspaceFn` ran per implementation; at minimum **workspace teardown after successful setup** must run. Prefer G1 as the required post-setup non-stepWalk case; G2 only if throw path is stable to assert |

**Where:** `packages/core/src/helpers/executeStepsForContextList/unit.test.ts` (new `it.skip` cases).

### 5.5 Core — success path order (**new**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| O1 | Single context success order | Echo step; all markers | `events` equals exactly: walk side-effect (optional) → `teardownFn:0` → `gitAdd` → `gitCommit` → `gitPush` → `teardownWorkspaceFn` (workspace teardown **after** push) |
| O2 | Two contexts success order | Two contexts, both succeed | Per context: `teardownFn` then git add/commit; **then** one `gitPush`; **then** `teardownWorkspaceFn`. No workspace teardown between contexts |

**Where:** `packages/core/src/helpers/executeStepsForContextList/unit.test.ts` (new `it.skip` cases). Do **not** overload `skips exec when commandFn returns null…` or the two-context logger.info test — different scopes.

### 5.6 Core — multi-context stop on second failure (**new**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| M1 | First OK, second walk fails | `ctx-a` succeeds; `ctx-b` `exit 1`; markers keyed by context index/name | `teardownFn` for `ctx-a`; git add/commit for `ctx-a`; `teardownFn` for `ctx-b`; **no** git for `ctx-b`; **no** `gitPush`; `teardownWorkspaceFn` ran; `reason: 'stepWalkFailed'`; no third context if only two |

**Where:** `packages/core/src/helpers/executeStepsForContextList/unit.test.ts` (new `it.skip` case).

### 5.7 Core — `runLump` preserves `reason` (**new**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| R1 | Propagates `stepWalkFailed` | Force `executeStepsForContextList` failure with `reason: 'stepWalkFailed'` (mock helper **or** real failing steps through `runLump`) | `runLump` Result `success: false`; `data.message` has existing `Error in runLump: Failed to execute steps…` prefix; **`data.reason === 'stepWalkFailed'`** |
| R2 | Propagates `workspaceTeardownFailed` | Same with that reason | Message rewritten; `reason` preserved |

**Where:** new `packages/core/src/usages/runLump/unit.test.ts` (`describe.skip` / `it.skip` until implementation). Prefer mocking `executeStepsForContextList` only if real end-to-end through `runLump` is too heavy; otherwise one real temp-repo failure is enough for R1 and a mock for R2.

**Impl note:** Today `runLump` uses `set(executeStepsResult, ['data', 'message'], …)` which should keep sibling keys; the test locks that contract.

### 5.8 CLI — warn on workspace teardown failure (**new**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| C1 | `workspaceTeardownFailed` | Mock `runLump` → `failure({ message, reason: 'workspaceTeardownFailed' })`; capture warn | CLI Result `success: false`; `data.kind === 'message'`; warn logged once with intent: teardown failed after lump finished; commit/push usually already succeeded; next preflight should reset execution workspace |
| C2 | `stepWalkFailed` | Mock `runLump` → `failure({ message, reason: 'stepWalkFailed' })` | CLI Failure `kind: 'message'`; **no** warn matching the “already succeeded” / “usually already” teardown wording |
| C3 | Failure without `reason` | Mock plain `{ message: '…' }` | Still message Failure; **no** workspace-teardown warn |

**Where:** `packages/apps/cli/src/utils/runLumpFromJsConfig/unit.test.ts` (new `it.skip` cases in existing suite — no existing failure-envelope `it` to update).

**Impl notes:** Reuse `callRunLumpFromJsConfig` / `makeJsConfig` fixtures. Do not introduce a new CLI failure `kind`. Exact warn string can be asserted with a substring/regex, not a brittle full snapshot.

---

## 6. Existing tests that must change

| Location | ID | Change |
| --- | --- | --- |
| `packages/core/src/helpers/executeStepsForContextList/unit.test.ts` — “stops the step walk when the command fails…” | T1 | Add markers + `reason` + no-git; **`it.skip` in `testImpl`**, unskip after implementation |
| `packages/core/src/helpers/executeStepsForContextList/timeoutAbort.unit.test.ts` — S2 | T2 | Add teardown/`reason`/no-git; **`it.skip` in `testImpl`**, unskip after implementation |
| `packages/core/src/helpers/executeStepsForContextList/timeoutAbort.unit.test.ts` — S3 | T3 | Same as T2 |
| `packages/core/src/helpers/executeStepsForContextList/timeoutAbort.unit.test.ts` — S4 | T4 | Same as T2 |
| Any other test that assumed “failure returns before teardownWorkspaceFn” | — | Update expectations if found during implementation |

Do **not** change push-failure (or commit-failure) tests that assert `success: true` + `logger.error` (push/commit still log-only).

Leave S1 / S5 (continueOnError success paths) alone unless they break.

---

## 7. Out of scope (explicit)

| Item | Why |
| --- | --- |
| E2E Ctrl+C / daemon abort of full `lumpcode run` | Requirements: no E2E; unit abort + CLI wire from prior backlog suffice |
| Daemon stops when workspace teardown fails | Non-goal |
| Extra `reason` values beyond the two | Non-goal |
| Changing `TeardownFn` / `TeardownWorkspaceFn` signatures | Non-goal |
| Agent process-tree kill | Separate backlog (already tested) |
| Docs content snapshots | Implementation acceptance |
| Recipes | Unchanged |

---

## 8. Acceptance mapping

| Requirements acceptance | Covered by |
| --- | --- |
| AC1 — step-walk failure/abort runs teardowns, skips push, `stepWalkFailed` | T1–T4 (updates), M1 (new) |
| AC2 — post-setup exits (e.g. git add fail) still run `teardownWorkspaceFn` | G1 |
| AC3 — success order walk → teardownFn → git → push → workspace teardown | O1, O2 |
| AC4 — `teardownFn` throw never blocks git / never replaces Result | F1, F2, W3 |
| AC5 — lone workspace-teardown failure → `workspaceTeardownFailed` + CLI warn + `kind: 'message'` | W1, C1 |
| AC6 — step-walk already failed → reason stays `stepWalkFailed` despite teardown fail | W2 |
| AC7 — multi-context unit test | M1 |
| AC8 — docs / no daemon-stop | Implementation checklist (not `testImpl`) |
| `runLump` preserves `reason` | R1, R2 |
| CLI no warn on `stepWalkFailed` | C2 |

---

## 9. Commands to run

```bash
npm run test -w=@lumpcode/core
npm run test -w=@lumpcode/cli
```

Optional focus during red/green:

```bash
npm run test -w=@lumpcode/core -- src/helpers/executeStepsForContextList/unit.test.ts
npm run test -w=@lumpcode/core -- src/helpers/executeStepsForContextList/timeoutAbort.unit.test.ts
npm run test -w=@lumpcode/core -- src/usages/runLump/unit.test.ts
npm run test -w=@lumpcode/cli -- src/utils/runLumpFromJsConfig/unit.test.ts
```

---

## 10. Implementation-stage checklist (not automated here)

Confirm manually / by review when implementing:

- [ ] `AGENTS.md` engine bullet: teardowns always after successful workspace setup; soft `teardownFn`; workspace teardown failure reason; push still after per-context git on success
- [ ] `packages/apps/cli/DOCS/concepts.md` short note: failed runs still tear down branch workspace; if teardown itself fails, commit/push usually already happened; next preflight resets
- [ ] Exported `ExecuteStepsFailureReason` / `ExecuteStepsFailureData` (or equivalent) used by `executeStepsForContextList` and `runLump`
- [ ] No daemon-stop-on-teardown-failure behavior added
- [ ] Success path never runs `teardownWorkspaceFn` before git add/push
- [ ] All `it.skip` / `describe.skip` cases for this item (T1–T4 updates + new F/W/G/O/M/R/C) are unskipped and green
