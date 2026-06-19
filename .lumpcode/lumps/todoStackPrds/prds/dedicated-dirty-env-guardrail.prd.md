# PRD: Dedicated-mode dirty working tree guardrail

| Field | Value |
| --- | --- |
| **Backlog** | `dedicated-dirty-env-guardrail` (priority 1) |
| **Status** | Pending implementation |
| **Packages** | `packages/apps/cli` (primary); `packages/core` unchanged |

## Problem statement and motivation

In **`dedicated`** mode (`.lumpcode/local.json` → `"mode": "dedicated"`), the **execution workspace** is the operator’s checkout itself. Pre-flight today runs a **destructive** git sequence on that tree:

```text
git fetch --all
git switch <projectBaseBranch>
git reset --hard origin/<projectBaseBranch>
git pull origin <projectBaseBranch>
```

That sequence **silently discards** uncommitted work (tracked edits, staged changes, and anything reset/publish would destroy). The existing unit test *“discards uncommitted local changes via git reset --hard”* encodes this behavior.

Operators who pick `dedicated` for a daemon or CI host often assume Lumpcode only touches “its” state. In practice, manual edits, half-finished agent output, or a crashed lump left on a work branch can be **wiped without warning** on the next `lumpcode run` or daemon tick. That is surprising and hard to debug compared to a fast, explicit failure.

**`shared`** mode does not have the same user-facing risk for the day-to-day clone: pre-flight resets the **project copy** under `~/.lumpcode/project-copies/<projectName>/`, and the source checkout is intentionally untouched (already covered by tests).

This task adds a **guardrail**: in `dedicated` mode only, pre-flight must **fail before any destructive git** when `git status --porcelain` is non-empty, with a message that tells the operator how to recover (`commit`, `stash`, or discard).

## Goals

1. **Fail fast in `dedicated` mode** when the execution workspace working tree is dirty, **before** `git fetch` / `git switch` / `git reset --hard` / `git pull`.
2. **Clear, actionable UX** — one human-readable failure string (and the same string surfaced through existing `commandFailure` / daemon log paths).
3. **Preserve destructive reset for clean trees** — when porcelain is empty, pre-flight behavior stays unchanged (recovery after a crashed lump still relies on reset).
4. **No behavior change in `shared` mode** — source clone may stay dirty; project copy may still be reset in place.
5. **Test coverage** — unit tests in `runPreflight`; one E2E scenario on the SEA binary (per `complete-e2e-binary-test` backlog note).

## Non-goals

- Requiring a clean tree in **`shared`** mode (copy reset remains the recovery mechanism).
- A new CLI flag (`--force`, `--allow-dirty`) — operators fix git state or switch to `shared` on a dev machine.
- Changing **per-lump** git flows after pre-flight (checkout / worktree setup).
- Structured JSON error codes for pre-flight failures (optional follow-up with `graceful-error-handling`; v1 uses the existing string `commandFailure` path).
- Detecting “dirty” via means other than `git status --porcelain` (no custom ignore rules, no diff against `origin/<branch>` only).
- `plan` / `validate` / `lump-status` — they do not run pre-flight today and stay out of scope.
- Auto-stash, auto-commit, or interactive prompts to resolve dirtiness.

## User stories / use cases

1. **Operator (dedicated server)** — I left local edits on the daemon checkout. The next `lumpcode start` tick should **not** destroy them; it should log a pre-flight error and retry on the next schedule after I stash or commit.
2. **Operator (manual run)** — I run `lumpcode run myLump` on a dedicated clone with uncommitted changes. The CLI exits non-zero immediately with guidance to clean the tree, not after a silent reset.
3. **Operator (crashed lump)** — A lump died mid-run on a lump branch with uncommitted files. Pre-flight fails until I deliberately reset or clean (e.g. `git reset --hard`, `lumpcode clean` after making the tree clean). I accept that trade-off instead of silent data loss.
4. **Operator (shared workstation)** — My main clone has uncommitted WIP; `mode: "shared"` runs still use the project copy and do not require my source tree to be clean.
5. **Maintainer** — CI/E2E proves dedicated + dirty tree → failure without running the agent or mutating tracked files.

## Proposed behavior and UX

### When the check runs

Inside `runPreflight` (`packages/apps/cli/src/utils/runPreflight/main.ts`):

1. Resolve `executionWorkspacePath` (today: `sourceProjectRoot` for `dedicated`, project copy for `shared`).
2. **If `mode === 'dedicated'`:** run `git status --porcelain` with `cwd: executionWorkspacePath`.
   - If stdout is non-empty (after trim) → return `failure(...)` and **do not** call `pullProjectBaseBranch`.
3. **Else (`shared`):** skip the check; continue with `ensureProjectCopy` / `pullProjectBaseBranch` as today.

Order matters: the dirty check is the first git interaction on the execution workspace for that pre-flight.

### What counts as “dirty”

Use the default porcelain format from Git (no `-uno` unless explicitly decided in implementation — see open questions):

- Modified / staged tracked files
- Untracked files (`??`)
- Typical merge/rename/conflict markers porcelain reports

Do **not** treat “on the wrong branch” alone as dirty if porcelain is empty; pre-flight will still `git switch` later.

### Failure message (human-facing)

Single string returned through `Failure<string>` (same pattern as other pre-flight git errors). Suggested copy (tune in implementation; keep stable for tests):

```text
Pre-flight failed: working tree has uncommitted changes in dedicated mode (<absolute path>). Commit, stash, or discard local changes before running Lumpcode. Run `git status` in that directory for details.
```

Requirements:

- Mention **`dedicated` mode** so operators know why `shared` might still work on another machine.
- Include the **execution workspace path** (absolute).
- Point to **`git status`** for details; do not dump porcelain into the CLI message by default (noisy).

### Commands affected (syntax unchanged)

| Command | Pre-flight | On dirty dedicated tree |
| --- | --- | --- |
| `lumpcode run <lumpName>` | Yes | Non-zero exit; `commandFailure` message |
| `lumpcode start` / daemon tick | Yes | Tick skipped; error logged to daemon log; next cron retry |
| `lumpcode clean` | Yes (`runProjectPreflight`) | Same failure — operator must clean tree before branch cleanup |

```bash
lumpcode run <lumpName> [--json]
lumpcode start [--foreground] [--cronSetup '<cron>'] [--lumpName <lumpName>] [--json]
lumpcode clean [--lumpName <lumpName>] [--contextName <contextName>] [--json]
```

**`--json`:** v1 continues to surface the failure as today for pre-flight errors (message in the standard CLI JSON envelope). No new required fields.

### `shared` mode (unchanged)

- Source checkout may have uncommitted files; pre-flight does not read porcelain on the source.
- Project copy may still be hard-reset; test *“never touches the source clone”* remains valid.

## Technical approach

### Scope: `packages/apps/cli`

| Area | Change |
| --- | --- |
| `src/utils/runPreflight/main.ts` | Add dedicated-only `git status --porcelain` check before `pullProjectBaseBranch`; export nothing new unless a tiny helper improves testability. |
| `src/utils/runPreflight/unit.test.ts` | Replace *“discards uncommitted local changes”* with *“fails when working tree is dirty”*; add case for clean tree still succeeding; optional case for untracked-only dirty. |
| `src/utils/runProjectPreflight/unit.test.ts` | Optional integration-style test: `.lumpcode/local.json` + dirty file → failure propagates. |
| `src/e2e/` | New scenario (e.g. `RUN-S6 dedicated-dirty-preflight`): `mode: dedicated`, dirty file, `run` exits non-zero, file content unchanged, no agent marker on remote. |
| `DOCS/local-config.md`, `DOCS/concepts.md`, `DOCS/commands.md` | Document guardrail under Pre-flight / dedicated mode / failure lists. |
| Root `AGENTS.md` | Align workspace fact: dedicated pre-flight **requires** clean tree; shared does not require clean source (copy may reset). |

### Implementation sketch

```ts
// Pseudocode inside runPreflight, after executionWorkspacePath is known:
if (mode === 'dedicated') {
  const status = await execAsync('git status --porcelain', { cwd: executionWorkspacePath });
  if (!status.success) return failure(/* git error */);
  if (status.data.stdout.trim() !== '') {
    return failure(/* message per UX section */);
  }
}
const pullResult = await pullProjectBaseBranch({ ... });
```

- Use `execAsync` with `cwd` (no `cd &&` chains).
- Prefer a private function in `runPreflight/main.ts` unless a second caller appears (YAGNI).

### Out of scope packages

- `packages/core` — no engine API changes.
- `@lumpcode/cli-types`, GUI, API — unchanged.

## Testing strategy

### Unit tests (`packages/apps/cli/src/utils/runPreflight/unit.test.ts`)

| Case | Expectation |
| --- | --- |
| Dedicated + clean tree | Pre-flight succeeds; `git reset --hard` path still runs (existing pull test). |
| Dedicated + modified tracked file | `success === false`; failure message mentions dedicated / uncommitted; file content **unchanged** after failed pre-flight. |
| Dedicated + untracked file only | Same failure (if porcelain lists it). |
| Shared + dirty source | Pre-flight succeeds; source marker file test still passes. |
| Dedicated + `git status` fails (invalid repo) | Failure propagated (existing error style). |

Use real temp git repos (current fixture style), not mocks of `execAsync`.

### Unit tests (`runProjectPreflight`)

At least one test that reads `local.json` with `mode: "dedicated"` and asserts failure propagates when the project root is dirty.

### E2E (`packages/apps/cli/src/e2e/`)

Add scenario per `complete-e2e-binary-test.prd.md` / `upgrade-e2e.md` cross-reference:

1. `createProject({ localJson: { mode: 'dedicated' }, ... })` (default is already dedicated; be explicit).
2. Write an uncommitted change under the project root (e.g. `DIRTY.txt`).
3. `lumpcode run <lumpName> --json` → non-zero / failure envelope.
4. Assert file content unchanged and no new lump marker on `origin`.

Run on CI matrix platforms where E2E already runs (Linux/macOS; Windows when harness supports it).

### What not to test

- Exact porcelain line format across Git versions (assert non-empty stdout via stub or behavioral outcome).
- `plan` / `validate` (no pre-flight).

## Docs updates

| Doc | Update |
| --- | --- |
| `packages/apps/cli/DOCS/local-config.md` | Under **dedicated** and **Pre-flight**: pre-flight **fails** if porcelain is non-empty; destructive reset runs only on a **clean** tree. Remove or soften wording that implies silent wipe is the only story (“wipes any uncommitted” → “would wipe …; Lumpcode refuses to run while the tree is dirty”). |
| `packages/apps/cli/DOCS/concepts.md` | Pre-flight step list: dedicated adds clean-tree check before fetch/reset. |
| `packages/apps/cli/DOCS/commands.md` | `run` / `start` **Fails if** bullets: dirty working tree in dedicated mode. |
| `AGENTS.md` (repo root) | Correct the pre-flight bullet to match implemented behavior (dedicated-only clean-tree requirement). |

No migration guide; document current behavior only.

## Acceptance criteria

- [ ] In `dedicated` mode, `runPreflight` returns `failure` when `git status --porcelain` is non-empty **before** any `git fetch` / `git switch` / `git reset --hard` / `git pull`.
- [ ] Failure message states dedicated mode, includes the execution workspace path, and advises commit/stash/discard + `git status`.
- [ ] In `dedicated` mode with a clean tree, pre-flight behavior is unchanged (including destructive reset for recovery).
- [ ] In `shared` mode, a dirty **source** checkout does not fail pre-flight; existing “never touches the source clone” test still passes.
- [ ] `lumpcode run` exits non-zero with the failure message when dedicated + dirty.
- [ ] Daemon tick logs pre-flight failure and skips the tick when dedicated + dirty (no silent reset).
- [ ] `lumpcode clean` fails pre-flight when dedicated + dirty (same guardrail).
- [ ] Unit tests updated; former “discards uncommitted” expectation removed or inverted.
- [ ] E2E scenario added for dedicated dirty → run failure without remote side effects.
- [ ] User docs (`local-config.md`, `concepts.md`, `commands.md`) and `AGENTS.md` reflect dedicated-only guardrail.

## Open questions and risks

| Topic | Question / risk | Recommendation |
| --- | --- | --- |
| Untracked files | Should `??` block runs? | **Yes** — use default porcelain; untracked files are often accidental WIP. Document that operators can `git clean` or add to `.gitignore`. |
| `git status -uno` | Ignore untracked only? | **No** for v1 — simpler mental model (“any porcelain line fails”). Revisit if operators complain about ignored build artifacts. |
| Crashed lump on lump branch | Clean porcelain but wrong branch | Out of scope; pre-flight still switches/resets. |
| `clean` + dirty tree | User cannot run `clean` until tree is clean | Accept for v1 (consistent pre-flight). Document stash/discard first. Follow-up: optional `--skip-preflight` only if product demands it. |
| `.lumpcode` artifacts | Untracked worktrees / status files under execution workspace | If porcelain lists them, pre-flight fails — operator removes or gitignores. `project-setup` already gitignores key paths; document if needed. |
| AGENTS.md drift | Doc claimed global clean-tree check | Fix in same PR as implementation. |
| Message stability | E2E may assert substring | Keep a stable phrase like `uncommitted changes in dedicated mode` for tests. |
| Windows | `git status --porcelain` on win32 | Same command via `execAsync`; rely on existing CI matrix when Windows E2E is enabled. |
| JSON error codes | Scripting wants `workingTreeDirty` | Defer to `graceful-error-handling`; v1 string-only. |

## Related backlog

- **`complete-e2e-binary-test`** — E2E scenario for this task should land after or with implementation.
- **`graceful-error-handling`** — may later add stable codes for pre-flight failures.
- **`upgrade-e2e`** — references dedicated dirty-tree coverage.
- **`fix-in-start-run-no-double-lump-launch`** — orthogonal (branch workspace locking); both can affect daemon ticks independently.
