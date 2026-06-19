# PRD: End-to-end scenario tests against the SEA binary

| Field | Value |
| --- | --- |
| **Backlog** | `complete-e2e-binary-test` · priority **1** |
| **Status** | Done |
| **Packages** | `packages/apps/cli` (primary); `.github/workflows/build-cli.yml` (CI wiring); `packages/core` unchanged |

## Problem statement and motivation

Lumpcode ships as a **Single Executable Application (SEA)** binary (`bin/lumpcode-<platform>-<arch>`), not as an npm-installed CLI. Most automated coverage today exercises command handlers **in-process** via Vitest (`handlerMaker` + injected `globalConfigFolderPath`, mocked `spawn`, or mocked `runLump`). CI’s only binary check is **`--help`** after `build:sea`.

That gap matters because production behavior differs from unit tests in ways that only show up in a real subprocess:

- **SEA vs Node entry** — detached `start` re-execs `process.execPath` with different argv when `isSea()` is true (no `process.argv[1]` CLI entry). Unit tests use `aliveDaemonSpawnFn` + `daemonForegroundChild.cjs`, which does not exercise the real SEA re-exec path.
- **Dynamic `import()` of command modules** — ncc/SEA bundling wraps `resolveImportable`; command modules must load from disk at runtime under `.lumpcode/commands/`.
- **Preflight + git + workspace** — `run`, `start` ticks, `lump-status`, and `clean` share execution-workspace resolution (`local.json` `mode`, `workspaceStrategy`) and remote-based context status; regressions often appear only when the full stack runs together.
- **Release confidence** — many backlog items (`graceful-error-handling`, `dedicated-dirty-env-guardrail`, daemon bootstrap, preset agents) depend on trustworthy binary-level regression tests before merge.

Without scenario tests, we risk shipping binaries that pass unit tests and `--help` but fail on `run`, daemon lifecycle, status refresh, or cleanup.

## Goals

1. **Subprocess E2E against the built SEA binary** — invoke the real artifact (not `handlerMaker`), with assertions on exit codes, stdout/stderr, git remotes, daemon PID/meta/log files, and context status records.
2. **Multiple independent scenarios** — cover meaningfully different configs (lumps, `local.json`, workspace strategy, disabled lumps, branch limits), not one happy-path smoke test.
3. **Deterministic mock agent** — replace real AI CLIs with a **simple mock command** (`echo`, `touch`, or shell one-liner) that proves the engine ran and leaves inspectable artifacts (marker file, commit subject, branch). The shared `e2e-agent` module is **generated at test runtime** from harness source (not shipped as a static fixture); individual scenarios may instead use **inline `CommandFn`** in `config.js` when that fits better.
4. **CI integration** — extend the existing binary build workflow so E2E runs on **Linux and macOS** matrix legs after `build:sea`, blocking regressions before artifact upload. **Windows** matrix legs keep the existing `--help` smoke only until a follow-up adds Windows E2E.
5. **Local developer ergonomics** — `npm run test:e2e` (or equivalent) in `packages/apps/cli` builds (or reuses) the binary and runs scenarios with clear failure output.

## Non-goals

- Replacing existing Vitest unit/integration tests (`handlerMaker`, `aliveDaemonSpawnFn`, mocked `runLump`) — E2E **complements** them.
- Testing real third-party agents (Claude, Cursor, Copilot, etc.) or network/API auth (`login` is out of scope for these scenarios).
- macOS notarization, quarantine stripping, or Windows code-signing (`binary-deployment-setup` backlog).
- GUI, API package, or `@lumpcode/cli-types` changes unless a type is strictly required for test helpers (unlikely).
- Full matrix of every CLI subcommand (`project-setup`, `lump-create`, `lump-plan`, `daemon-log` follow, etc.) — v1 focuses on **`run`**, **`start`** (daemon), **`lump-status`**, **`clean`**, plus minimal **`stop`** / **`daemon-status`** where needed to manage daemon scenarios.
- Performance/load testing or parallel multi-machine runs.
- **Windows E2E** — v1 targets **Linux and macOS** only (local dev and CI). Windows binary build stays in the matrix; full scenario E2E on Windows is a **follow-up** (shell mock, `HOME` isolation, path semantics).
- Adding `LUMPCODE_GLOBAL_CONFIG` env override in product code — prefer **isolated `HOME`** for subprocess tests unless implementers prove it insufficient.

## User stories / use cases

1. **Maintainer (CI)** — When the CLI binary workflow runs on **Ubuntu or macOS**, after `build:sea` the E2E suite runs against that platform’s artifact; failure blocks the artifact upload. Windows legs continue **`--help`** only until Windows E2E lands.
2. **Maintainer (local)** — Before opening a PR that touches CLI bundling, daemon, or run path, I run `npm run test:e2e` once; it builds the local SEA binary and completes in a few minutes without installing Claude.
3. **Contributor (regression)** — A change to `resolveImportable` or SEA config breaks command-module loading; an E2E `run` scenario fails with “command module not found” instead of passing unit tests only.
4. **Contributor (daemon)** — Detached `start` → real foreground child via SEA re-exec writes PID/meta under an isolated global config dir; `daemon-status` reports running; `stop` clears it — verified by binary subprocesses, not `daemonForegroundChild.cjs`.
5. **Contributor (status + clean)** — After a mock-agent `run`, `lump-status` shows `branchPushed` (or `finished` when seeded); `clean` removes lump branches and worktrees; a second `run` can proceed from `toDo` again.

## Proposed behavior and UX

E2E is **not** a new user-facing command. Operators and CI run a **test harness**; the harness drives the same CLI syntax documented in `packages/apps/cli/DOCS/commands.md`.

### Harness contract (implementer-facing)

| Concern | Convention |
| --- | --- |
| Binary path | `LUMPCODE_E2E_BINARY` env, or auto-detect `packages/apps/cli/bin/lumpcode-<platform>-<arch>` after `npm run build:sea` (**Linux/macOS v1**; no Windows auto-detect in v1) |
| Project root | Temp directory with `.lumpcode/` + `.git/` + bare `origin` remote (same pattern as `clean/unit.test.ts`, `start/unit.test.ts`) |
| Global config isolation | Set `HOME` to a temp dir so daemon files land under `<tmpHome>/.lumpcode/daemons/` |
| Working directory | Subprocess `cwd` = **project workspace** (directory containing `.lumpcode` and `.git`) |
| Timeouts | Per-scenario ceiling (e.g. 120s default; daemon scenarios may need longer first tick) |

Helper API (illustrative):

```ts
runCli({ binary, projectRoot, homeDir, args: ['run', 'myLump', '--json'], timeoutMs });
```

### Mock agent (generated module or inline `CommandFn`)

E2E must **not** ship a committed static `.lumpcode/commands/e2e-agent.js` fixture. The harness owns mock-agent logic in **test source** (e.g. `createE2eAgentCommandModule()` or equivalent) and **writes** `.lumpcode/commands/e2e-agent.js` into each temp project when a scenario needs it — so the on-disk module stays in sync with harness changes on every `test:e2e` run. Written files must be plain `.js` (runtime does not load `.ts`).

**Not every scenario uses `e2e-agent`.** Scenarios that need different mock behavior (or that exercise `config.js` resolution) may use **`config.js` with an inline `command` function** (`CommandFn`) per `packages/apps/cli/DOCS/lump-config.md` (Command names) — no registry lookup, no command-module file. Use the generated `e2e-agent` module when several scenarios share the same default mock; use inline functions when a scenario needs bespoke shell behavior or config.js-only paths.

**Default generated `e2e-agent` responsibilities:**

- `command({ prompt, context, contextRunState })` — run a shell command that:
  - Writes a deterministic marker file, e.g. `.lumpcode/e2e-markers/<lumpName>/<contextName>.done` (via `touch` or `node -e`), **or** appends prompt hash to stdout (for log assertions).
  - Uses `executable: 'sh'` (or `bash`) with a one-liner — no external AI binary. **Unix only in v1**; Windows shell mock deferred.
  - Exits 0 so the engine proceeds to git add/commit/push.
- `setup` (optional) — set `contextRunState.e2eRan = true` to prove setup ran through SEA `import()`.
- `teardown` (optional) — no-op.

**JSON lump config** — reference the generated module by bare name only:

```json
{
  "contextListJson": { "FILE": "README.md" },
  "prompt": { "promptTemplate": "E2E @{FILE}", "command": "e2e-agent" },
  "numberOfContextsPerBranch": 1
}
```

**JS lump config** — inline mock when the scenario does not need the shared module:

```js
export default {
  contextListJson: { FILE: 'README.md' },
  prompt: {
    promptTemplate: 'E2E @{FILE}',
    command: ({ context }) => ({
      executable: 'sh',
      args: ['-c', `touch .lumpcode/e2e-markers/${context.lumpName}/${context.name}.done`],
    }),
  },
};
```

Do **not** put agent flags in a lump `command` **string** field; flags belong inside the `CommandFn` return value (inline or inside a command module’s `command()`).

### CLI commands exercised (syntax)

All invocations use the **binary path** as argv0.

**Run (single tick, one lump)**

```bash
lumpcode run <lumpName> [--json]
```

**Daemon**

```bash
lumpcode start --foreground --cronSetup '<cron>' [--lumpName <lumpName>]
lumpcode daemon-status [--lumpName <lumpName>] [--json]
lumpcode stop [--lumpName <lumpName>]
```

E2E should prefer **`--foreground`** for deterministic ticks (no detached re-exec) in most scenarios; include **at least one** scenario with **detached** `start` (no `--foreground`) when feasible, to cover SEA re-exec + PID/meta written only in the foreground child (per product rules).

**Status**

```bash
lumpcode lump-status [--lumpName <lumpName>] [--silent] [--json]
```

**Clean**

```bash
lumpcode clean [--lumpName <lumpName>] [--contextName <contextName>]
```

(`--contextName` requires `--lumpName` per CLI rules.)

### Scenario catalog (v1)

Each scenario = fresh temp project + bare remote + isolated `HOME`, unless noted.

| ID | Name | Setup highlights | Actions | Key assertions |
| --- | --- | --- | --- | --- |
| S1 | `run-single-context-checkout` | `local.json`: `dedicated`, `checkout`; one lump, one context; harness writes generated `e2e-agent.js` | `run myLump --json` | Exit 0; remote has `lump/<lump>/<context>` branch; commit subject `LUMP:<lump> - <context>`; marker file exists |
| S2 | `run-resumable-skip` | Same as S1; run twice | `run` × 2 | Second run reports skip / no duplicate marker overwrite policy (engine skips finished/`branchPushed` contexts per resumable rules) |
| S3 | `lump-status-after-run` | After S1-style run | `lump-status --lumpName myLump --json` | Context row `branchPushed` (or matching remote state); `contextStatusRecord.json` updated under lump dir |
| S4 | `clean-after-run` | After S1 | `clean --lumpName myLump` | Lump branches removed local + remote; worktree dir gone if used |
| S5 | `daemon-foreground-tick` | `dedicated`, `checkout`; cron every minute or test hook | `start --foreground` with short run window + `waitForShutdownOverride` **not available in binary** — use env/cron `*/1 * * * *` and kill/stop after first tick log line, or document using short cron + timeout | Log contains tick / lump name; marker or branch appears; `stop` succeeds |
| S6 | `daemon-detached-meta` | Same; detached `start` | `start` → `daemon-status` → `stop` | PID/meta under `<home>/.lumpcode/daemons/<projectName>.daemon.*`; detached parent did **not** write PID (child did) |
| S7 | `multi-lump-global-daemon` | Two lumps `alpha`, `beta`; both enabled | `start --foreground` one tick | Both lumps attempted (order per product); distinct branches or markers per lump |
| S8 | `lump-disabled-skipped` | Lump `disabled: true` + enabled lump | `start --foreground` | Log mentions skipped disabled lump; enabled lump still runs |
| S9 | `worktree-strategy` | `workspaceStrategy: worktree` | `run` | Worktree path under `.lumpcode/worktrees/...`; branch pushed; marker in worktree cwd |
| S10 | `shared-mode-run` | `mode: shared` (project copy) | `run` | Run targets copy under global `project-copies/`; source checkout unchanged (assert file only in copy if feasible) |
| S11 | `maximum-open-branches-skip` | `maximumNumberOfConcurrentBranches: 1`; seed one remote lump branch | `run` | JSON/success with `skipped` / `tooManyOpenBranches`; no new marker |
| S12 | `clean-scoped` | Two contexts / lumps | `clean --lumpName X --contextName Y` | Only targeted branch removed (mirror `clean/unit.test.ts` behavior at binary level) |
| S13 | `per-lump-daemon` | `--lumpName alpha` | `start --foreground --lumpName alpha` | Meta file `projectName.alpha.daemon.meta.json`; `beta` not run |

Implementers may merge S1+S3+S4 into one scenario file with steps; the table defines minimum **coverage breadth**.

### Expected UX for failures

When a scenario fails, the harness prints:

- Scenario name and step
- Full argv and `cwd`
- stdout/stderr tails
- Optional: `git log --oneline --all`, `git branch -a`, daemon log path

No change to end-user CLI error messages unless a bug is found and fixed under a separate task.

## Technical approach

### Affected packages and files

| Area | Change |
| --- | --- |
| `packages/apps/cli` | New `src/e2e/` (or top-level `e2e/`) — scenarios, harness, shared templates |
| `packages/apps/cli/src/e2e/` | Harness helpers including **`createE2eAgentCommandModule()`** (or template) that **generates** `e2e-agent.js` at project setup — **no committed static `e2e-agent.js` in fixtures**; optional lump config snippets, `local.json` templates |
| `packages/apps/cli/package.json` | Scripts: `test:e2e`, optionally `test:e2e:ci` (build + test) |
| `packages/apps/cli` Vitest | Either separate Vitest project `include: ['src/e2e/**/*.test.ts']` with `testTimeout` elevated, or Node test runner — must not slow default `npm test` unacceptably; recommend **separate script** |
| `.github/workflows/build-cli.yml` | After “Test binary” (`--help`), run E2E suite on **Linux and macOS** matrix legs only |
| `packages/apps/cli/src/testing/` | **No replacement** of `aliveDaemonSpawnFn`; E2E uses real binary only |
| Docs | Short “Running E2E” subsection in `packages/apps/cli/README.md` or `CONTRIBUTING` — not user-facing `DOCS/commands.md` |

### Harness design

1. **`resolveE2eBinary()`** — honor `LUMPCODE_E2E_BINARY`; else `path.join(__dirname, '../../bin', lumpcode-${platform}-${arch})` for **Linux/macOS** (`linux`/`macos` + `x64`/`arm64`). Fail fast on Windows in v1 (or when `process.platform === 'win32'`) with a message that Windows E2E is not yet supported.
2. **`createE2eProject(options)`** — async factory:
   - `mkdtemp` project root; `git init`, bare remote, `push origin main`
   - Write `.lumpcode/project.json`, `local.json`, lump dir(s)
   - When `options.useE2eAgent !== false` (default for JSON-based lumps): **generate and write** `.lumpcode/commands/e2e-agent.js` from harness source via `createE2eAgentCommandModule()` — do not copy a static fixture file
   - When a scenario passes inline `CommandFn` in `config.js`, skip writing `e2e-agent.js` unless the scenario also needs registry-based command loading
   - Optional `src/` files for `contextListJson` globs
3. **`runCli()`** — `child_process.spawn` binary with `cwd: projectRoot`, `env: { ...process.env, HOME: tmpHome }`, collect stdout/stderr, enforce timeout, return `{ code, stdout, stderr }`.
4. **`git` helpers** — thin wrappers using `execSync` from test process (same as unit tests) to assert remote branches and commit messages (`getGitCommitMessage` format).
5. **Daemon synchronization** — poll `daemon-status --json`, PID file, or log file under `<tmpHome>/.lumpcode/daemons/`; use `stop` in `afterEach` to avoid leaked processes on developer machines.

### Binary build dependency

E2E assumes the same build chain as CI:

```bash
# from repo root
npm ci
npm run build -w=@lumpcode/core
cd packages/apps/cli && npm run build:bundle && npm run build:sea
```

Local `test:e2e` should fail fast with a message if `bin/lumpcode-*` is missing.

### CI wiring

In `.github/workflows/build-cli.yml`, replace or extend the “Test binary” step:

1. Keep `--help` smoke (fast) on **all** matrix legs including Windows.
2. On **Linux and macOS** legs only: run `npm run test:e2e` (or `npx vitest run src/e2e`) with `LUMPCODE_E2E_BINARY` pointing at the matrix artifact path.
3. Set `HOME` to `$RUNNER_TEMP/lumpcode-e2e-home` in the job env for E2E legs.

Use `fail-fast: false` matrix behavior as today; each OS builds its own binary; only Unix-like legs run the full E2E suite.

### Relationship to existing tests

| Existing | E2E difference |
| --- | --- |
| `commands/*/unit.test.ts` | Handler in-process; E2E subprocess |
| `aliveDaemonSpawnFn` | Stub child script; E2E real SEA daemon |
| `runLumpFromJsConfig/unit.test.ts` | Mocks `runLump`; E2E runs full engine |
| `jsConfigToRunLumpInput/__fixtures__/global-config/commands/test-agent.js` | Unit resolution only; E2E uses harness-generated project-local `e2e-agent` and/or inline `CommandFn` in `config.js` |

Reuse **patterns** (temp git, `minimalLumpConfigJson`, `writeDefaultLocalJson`) but do not share mutable state between parallel scenarios.

### Deferred: Windows E2E (follow-up)

Not in v1. When added later:

- Binary name `lumpcode-windows-x64.exe`; mock agent via `cmd /c` or `node -e`.
- Global config isolation via `USERPROFILE` (or equivalent).
- CI: extend E2E step to the Windows matrix leg after shell/path issues are sorted out.

Until then, harness and mock agent assume **Unix shell** (`sh`/`bash`, `touch`, forward slashes in assertions).

### ncc / SEA constraints (regression targets)

E2E explicitly validates behaviors that broke in the past:

- Command modules load via dynamic `import()` from disk (not bundled into the binary).
- CommonJS-friendly dependencies only in the CLI bundle (no `lodash-es`-style ESM-only imports in CLI code paths hit by these scenarios).

## Acceptance criteria

- [ ] At least **10** distinct scenario implementations covering the catalog (S1–S13); may be grouped in fewer files but all behaviors asserted.
- [ ] Every scenario invokes the **SEA binary** subprocess, not `handlerMaker` or `tsx` entry.
- [ ] Mock agent runs through real engine paths — **generated `e2e-agent.js` written at scenario setup** and/or **inline `CommandFn` in `config.js`** — not a mocked `runLump` or Vitest-injected `commandFn`.
- [ ] No committed static **`e2e-agent.js`** fixture shipped under `src/e2e/fixtures/`; harness regenerates the module from source on each E2E run.
- [ ] At least one scenario uses **`config.js` with inline `command` function** (no `e2e-agent` file) to prove JS-config command resolution through the binary.
- [ ] Scenarios cover: **`run`**, **`start`** (foreground + detached), **`lump-status`**, **`clean`** (global + scoped).
- [ ] Config variation includes: **`dedicated` + `checkout`**, **`worktree`**, at least one **`shared`** run, **disabled lump**, **`maximumNumberOfConcurrentBranches` skip**, **multi-lump** daemon.
- [ ] Git assertions use real bare remotes and **`LUMP:<lumpName> - <contextName>`** commit subjects.
- [ ] Global daemon state is isolated via temp **`HOME`**; no writes to the developer’s real `~/.lumpcode` (verify in test teardown).
- [ ] `npm run test:e2e` in `packages/apps/cli` documents/builds prerequisite and exits non-zero on failure.
- [ ] `.github/workflows/build-cli.yml` runs E2E on **Linux and macOS** matrix legs after building the binary (Windows keeps `--help` only until follow-up).
- [ ] `npm run test:e2e` on **Windows** fails fast with a clear “not yet supported” message (or is documented as Linux/macOS-only).
- [ ] Default `npm test` (unit) remains reasonably fast — E2E on separate script or Vitest project.
- [ ] Leaked daemon processes: `stop` in scenario teardown; CI job does not leave running `lumpcode start` children.

## Open questions and risks

| Topic | Question / risk | Recommendation |
| --- | --- | --- |
| Detached daemon timing | Flaky waits for first tick | Prefer `--foreground` for most tests; one detached test with generous timeout + log polling |
| Cron granularity | Foreground daemon may need real time for Croner tick | Use `*/1 * * * *` or inject test-only very fast cron if product allows; avoid wall-clock >2 min per scenario in CI |
| `shared` mode copy path | Heavier IO; slower CI | One scenario only in v1; skip on resource-constrained runners if needed |
| Auth / API | Future login gate on `run` | Scenarios must not require `auth.json`; document if product adds gating |
| Parallel scenario execution | Git/port conflicts | Run E2E **serial** within a job (`fileParallelism: false` or single worker) |
| macOS ad-hoc sign | Gatekeeper on downloaded CI artifacts | N/A for same-job build+test; quarantine matters only for manual download tests |
| Marker race | Agent faster than git | Assert on remote after `run` exit 0, not only marker file |
| Branch workspace lock | Overlap with `fix-in-start-run` PRD | If lock lands before E2E, add scenario: `run` fails when daemon holds lock (optional v1.1) |
| `daemon-foreground-bootstrap` | May remove `daemonForegroundChild.cjs` | E2E should not depend on that stub; accelerates migration |
| Vitest timeout | Default 5s too low | `testTimeout: 120_000`+ for e2e project only |
| Log assertion brittleness | Console format changes | Prefer exit codes, JSON `--json`, git state, files on disk over log substring |
| Windows E2E | Deferred from v1 | Follow-up task: `cmd` mock, `USERPROFILE`, path normalization; enable CI step on `windows-latest` when ready |

## Related backlog

- **`dedicated-dirty-env-guardrail`** — depends on this task; add E2E scenario once implemented (dirty tree → preflight failure in `dedicated`).
- **`graceful-error-handling`** — extend E2E with git-auth / agent exit fixtures later.
- **`daemon-foreground-bootstrap`** — E2E validates real SEA path; reduces need for `daemonForegroundChild.cjs` in unit tests over time.
- **`preset-agent-commands`** — presets are not required for E2E; mock agent stays harness-owned (generated module and/or inline `CommandFn`), not a shipped preset.
- **`binary-deployment-setup`** — distribution/signing separate from functional E2E.
- **Windows E2E** — extend this harness to Windows (shell mock, env isolation, CI matrix leg) after v1 lands on Linux/macOS.
