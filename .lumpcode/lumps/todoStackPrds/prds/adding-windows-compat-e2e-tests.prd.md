# PRD: Windows-compatible E2E tests against the SEA binary

| Field | Value |
| --- | --- |
| **Backlog** | `adding-windows-compat-e2e-tests` · priority **1** |
| **Status** | Pending implementation |
| **Depends on** | `complete-e2e-binary-test` (done — Linux/macOS harness and CI legs exist) |
| **Packages** | `packages/apps/cli` (primary); `.github/workflows/build-cli.yml` (CI); docs in `packages/apps/cli/README.md` only |

## Problem statement and motivation

Lumpcode ships a **Windows SEA binary** (`bin/lumpcode-windows-x64.exe`) and CI already builds and smoke-tests it (`--help` on `windows-latest`). The **scenario E2E suite** (`packages/apps/cli/src/e2e/`) runs only on **Linux and macOS**: `scripts/run-e2e.mjs` exits immediately on `win32`, and `.github/workflows/build-cli.yml` runs `npm run test:e2e` only when `matrix.platform != 'windows'`.

That gap matters because Windows-specific behavior is invisible until manual testing or post-release reports:

- **Global config resolution** — production CLI uses `os.homedir()` (`packages/apps/cli/src/main.ts`, `constants/globalConfigFolderPath.ts`), not `process.env.HOME` alone. E2E today sets only `HOME` in `subprocessEnv.ts`, which isolates daemon/PID/meta paths on Unix but may **not** redirect `~/.lumpcode` on Windows unless `USERPROFILE` (and related vars) are aligned.
- **Mock agent shell** — harness-generated `e2e-agent` and inline `config.js` mocks use `executable: 'sh'` with `mkdir -p` / `touch` one-liners (`createE2eAgentCommandModule.ts`, `run-scenarios.test.ts` RUN-S3). Those commands do not exist on a stock Windows runner without Git Bash semantics wired into `sh`.
- **Process teardown** — `runCli.ts` uses `child.kill('SIGKILL')` on timeout; signal semantics differ on Windows and can leave orphaned `lumpcode start --foreground` children.
- **Path assertions** — worktree scenarios assert substring `.lumpcode/worktrees` in `pwd` output; Windows paths use backslashes and drive letters.
- **Binary naming and build** — artifact is `lumpcode-windows-x64.exe` via `build:sea:windows` / `build-sea.ps1`, while `run-e2e.mjs` auto-build calls `build:sea` (bash) and resolves `lumpcode-darwin|linux-<arch>` without `.exe`.

Without Windows E2E, regressions in SEA startup, dynamic command-module import, git/preflight, daemon lifecycle, or path handling on Windows can merge while Linux/macOS scenarios stay green.

## Goals

1. **Run the existing E2E scenario catalog on Windows** against the built `lumpcode-windows-x64.exe`, with the same behavioral assertions as Unix (exit codes, `--json` envelopes, git remote state, daemon PID/meta, markers on remote branches).
2. **Portable harness** — mock agent, env isolation, binary resolution, and subprocess helpers work on `win32` without requiring Git Bash as the default shell for every scenario.
3. **CI parity** — extend `build-cli.yml` so the **Windows matrix leg** runs the full E2E suite after `build-sea.ps1`, not only `--help`.
4. **Local Windows dev** — `npm run test:e2e` from `packages/apps/cli` on Windows builds (or reuses) the `.exe` and runs Vitest e2e config; remove the hard “not supported” exit in `run-e2e.mjs`.
5. **Document** — update `packages/apps/cli/README.md` “Running E2E” to describe Windows usage (`LUMPCODE_E2E_BINARY`, `build:sea:windows`, env isolation notes).

## Non-goals

- Changing production CLI path logic beyond what E2E **requires** to isolate global config (prefer test-only env overrides; avoid new `LUMPCODE_GLOBAL_CONFIG` product knob unless isolation cannot be achieved otherwise — see open questions).
- Replacing or shrinking the Linux/macOS E2E matrix legs (Windows **adds** coverage; Unix legs stay).
- Windows **arm64** SEA build or matrix row (today CI is `windows-latest` / x64 only).
- Real third-party agents, `login`, GUI, API, or `@lumpcode/core` engine changes unless a Windows bug is proven in core (unlikely for this task).
- WSL-only testing as the “solution” — primary target is **native Windows** (`windows-latest`, local PowerShell/cmd).
- Code signing, installer UX, or notarization (`binary-deployment-setup` backlog).
- New E2E scenarios beyond the catalog already implemented for Unix (port existing tests; optional small scenario tweaks only if a Windows quirk forces an assertion change — document in PR).

## User stories / use cases

1. **Maintainer (CI)** — On `windows-latest`, after the Windows SEA build, the same scenario suite that runs on Ubuntu/macOS runs against `lumpcode-windows-x64.exe`; failure blocks artifact upload for that leg.
2. **Maintainer (local, Windows)** — Before merging CLI/daemon changes, I run `npm run test:e2e` in PowerShell; it builds the `.exe` if missing and completes without WSL.
3. **Contributor (regression)** — A change breaks `resolveImportable` or schema loading beside `process.execPath` on Windows; RUN-S1 fails in CI instead of only on manual Windows smoke.
4. **Contributor (daemon)** — DAEMON-S2 verifies PID/meta under an isolated profile dir on Windows, matching Unix isolation guarantees (no writes to the developer’s real `%USERPROFILE%\.lumpcode`).
5. **Contributor (follow-up tasks)** — `dedicated-dirty-env-guardrail` and other backlog items that depend on E2E can add Windows scenarios once this harness is platform-neutral.

## Proposed behavior and UX

E2E remains a **test harness**, not a new CLI subcommand. Operators and CI invoke existing scripts; the CLI syntax under test is unchanged (`packages/apps/cli/DOCS/commands.md`).

### Operator / CI commands

From repo root (CI already uses `packages/apps/cli` as job `defaults.run.working-directory`):

```powershell
# Windows local / CI (packages/apps/cli)
npm run build:sea:windows
$env:LUMPCODE_E2E_BINARY = ".\bin\lumpcode-windows-x64.exe"
npm run test:e2e
```

Convenience (unchanged script name; behavior becomes cross-platform):

```bash
npm run test:e2e        # auto-resolve binary; on Windows run build:sea:windows when missing
npm run test:e2e:ci     # platform-appropriate build:sea + test:e2e
```

Optional override (all platforms):

```bash
LUMPCODE_E2E_BINARY=/path/to/lumpcode-... npm run test:e2e
```

**CI (`build-cli.yml`)** — new or extended step on the Windows matrix row, after “Test binary” (`--help`):

- `shell: pwsh` (or `cmd` if required for npm; prefer pwsh for consistency with `build-sea.ps1`).
- `env:LUMPCODE_E2E_BINARY`: `${{ github.workspace }}/packages/apps/cli/bin/lumpcode-windows-x64.exe`
- Isolated profile: set `USERPROFILE` (and `HOME` if Node/git tools read it) to `${{ runner.temp }}/lumpcode-e2e-home` for the E2E step only.
- `run: npm run test:e2e`

Unix legs keep today’s bash step and `HOME` under `runner.temp`.

### Harness contract (updated)

| Concern | Unix (current) | Windows (target) |
| --- | --- | --- |
| Binary path | `LUMPCODE_E2E_BINARY` or `bin/lumpcode-{darwin\|linux}-{x64\|arm64}` | `LUMPCODE_E2E_BINARY` or `bin/lumpcode-windows-x64.exe` |
| Auto-build when missing | `npm run build:sea` | `npm run build:sea:windows` |
| Global config isolation | `subprocessEnv`: `HOME=<tmp>` | Set **`USERPROFILE=<tmp>`** (and `HOME=<tmp>` for tools that use it); verify `os.homedir()` in child resolves to `<tmp>` |
| Project `globalConfigFolderPath` in tests | `path.join(homeDir, '.lumpcode')` | Same layout under isolated profile |
| Mock agent | `sh -c` with `mkdir -p` / `touch` | **Portable mock** (see below) |
| Timeout kill | `SIGKILL` | Cross-platform kill (no signal or `taskkill` tree only if needed) |
| Path assertions | forward-slash substrings | `path.normalize` / case-insensitive `includes` where comparing `pwd` output |

### Mock agent (platform-neutral)

Replace Unix-only shell one-liners with a mock that runs on all CI platforms without relying on `sh`:

**Recommended:** `executable: process.execPath` (or `'node'`) with `args: ['-e', '<short script>']` that:

- `fs.mkdirSync(..., { recursive: true })`
- `fs.writeFileSync` marker `.lumpcode/e2e-markers/<lumpName>/<contextName>.done`
- optionally writes `workspace-cwd.txt` for worktree probe (RUN-S3)

Apply in:

- `createE2eAgentCommandModule()` (generated `e2e-agent.js` / `e2e-agent-<lumpName>.js`)
- Inline `configJs` in `run-scenarios.test.ts` (RUN-S3)

Keep `setup` / `teardown` exports unchanged. **Do not** commit static fixture files; keep generate-at-setup behavior from `complete-e2e-binary-test`.

Generated module shape (illustrative):

```js
export const command = ({ context }) => ({
  executable: process.execPath,
  args: ['-e', `require('fs').mkdirSync('...',{recursive:true}); require('fs').writeFileSync('...');`],
});
```

(Implementers may use a tiny shared helper in harness TypeScript to emit escaped paths for lump/context names.)

### CLI commands exercised (unchanged)

Scenarios continue to drive the SEA binary as argv0:

```bash
lumpcode run <lumpName> [--json]
lumpcode start [--foreground] --cronSetup '<cron>' [--lumpName <lumpName>]
lumpcode daemon-status [--lumpName <lumpName>] [--json]
lumpcode stop [--lumpName <lumpName>]
lumpcode lump-status [--lumpName <lumpName>] [--json]
lumpcode clean [--lumpName <lumpName>] [--contextName <contextName>]
```

Cron strings remain single-quoted in docs; on Windows CI use the same pattern as `DOCS/commands.md` (PowerShell-safe quoting).

### Scenario catalog (must pass on Windows)

All existing e2e tests under `src/e2e/` (no reduction in coverage):

| File | IDs | Focus |
| --- | --- | --- |
| `run-scenarios.test.ts` | RUN-S1 … RUN-S5 | `run`, checkout/worktree/shared, branch limit skip |
| `daemon-scenarios.test.ts` | DAEMON-S1 … DAEMON-S5 | foreground/detached daemon, multi-lump, disabled, per-lump |
| `status-clean-scenarios.test.ts` | STATUS-CLEAN-S1 … S3 | `lump-status`, `clean` scoped/global |

`parseCliJson.unit.test.ts` stays in the e2e Vitest project (no subprocess); must run on Windows unchanged.

### Failure UX (unchanged intent)

On failure, print scenario id, argv, `cwd`, stdout/stderr tails, and optional git/daemon paths — same as Unix. No change to end-user CLI error strings unless a product bug is found and fixed under a separate task.

## Technical approach

### Affected files (indicative)

| Area | Change |
| --- | --- |
| `packages/apps/cli/scripts/run-e2e.mjs` | Remove `win32` early exit; platform-aware `binaryPath()` and `build:sea` vs `build:sea:windows` |
| `packages/apps/cli/src/e2e/harness/subprocessEnv.ts` | Windows profile isolation (`USERPROFILE`, `HOME`) |
| `packages/apps/cli/src/e2e/harness/daemonHelpers.ts` | `assertHomeIsolated` checks real `os.homedir()` / `USERPROFILE`, not `HOME` only |
| `packages/apps/cli/src/e2e/harness/createE2eAgentCommandModule.ts` | Node-based mock instead of `sh` |
| `packages/apps/cli/src/e2e/run-scenarios.test.ts` | RUN-S3 inline mock → Node-based |
| `packages/apps/cli/src/e2e/harness/runCli.ts` | Cross-platform timeout termination |
| `packages/apps/cli/src/e2e/harness/gitHelpers.ts` | Confirm `git` invocations work on Windows runners (Git for Windows in PATH); adjust only if a command assumes `/` paths incorrectly |
| `packages/apps/cli/package.json` | Optional: `test:e2e:ci` selects `build:sea` vs `build:sea:windows` by platform |
| `.github/workflows/build-cli.yml` | E2E step on `windows` matrix include |
| `packages/apps/cli/README.md` | Remove “Linux and macOS only”; document Windows |
| `packages/apps/cli/vitest.config.e2e.ts` | Unchanged unless Windows needs different timeouts (prefer keeping 120s) |

### `resolveE2eBinary` / `run-e2e.mjs`

Today Vitest reads only `LUMPCODE_E2E_BINARY` (`resolveE2eBinary.ts`); the runner script sets it after auto-detect. Extend auto-detect:

```ts
// illustrative
if (process.platform === 'win32') {
  return path.join(cliRoot, 'bin', 'lumpcode-windows-x64.exe');
}
// existing darwin/linux logic
```

Fail fast with a clear message if the binary is still missing after the correct build script.

### Environment isolation

Production resolves global config as:

```ts
path.join(os.homedir(), '.lumpcode')
```

E2E must ensure **child** `os.homedir()` equals the temp profile used for `project.globalConfigFolderPath`:

- Create `homeDir` via `fs.mkdtemp` under `os.tmpdir()` (unchanged).
- In `subprocessEnv(homeDir)`:
  - Always set `HOME=homeDir` (Git, some tools).
  - On `win32`, set `USERPROFILE=homeDir`; consider clearing or overriding `HOMEDRIVE`/`HOMEPATH` if tests show leakage to the real profile.
- Update `assertHomeIsolated` to compare against `os.homedir()` (and/or `process.env.USERPROFILE` on Windows), not only `process.env.HOME`.

Verify in a small harness unit test or DAEMON-S2 assertion that daemon files appear under `<homeDir>\.lumpcode\daemons\` on Windows.

### Git in tests

Harness already shells out to `git` via `gitHelpers.ts` from the **test process** (not the SEA binary). GitHub `windows-latest` includes Git for Windows. Use `path.join` for repo paths; avoid hard-coded `/` in test-process `exec` strings where Node paths are built.

Remote/ref assertions (`git show`, `for-each-ref`) should remain valid on bare repos on Windows.

### CI wiring

In `.github/workflows/build-cli.yml`:

1. Keep `--help` smoke on all platforms (already uses `.exe` on Windows).
2. Add E2E step when `matrix.platform == 'windows'` (mirror Unix env vars with Windows profile vars).
3. Keep `fileParallelism: false` / single worker (Vitest e2e config) — serial per job on all OSes.

Optional: add `test:e2e:ci` platform branch in `package.json` so local `npm run test:e2e:ci` on Windows does not invoke bash `build:sea`.

### Relationship to `complete-e2e-binary-test`

| Delivered (done) | This PRD |
| --- | --- |
| Harness + 13+ scenarios on Linux/macOS | Port harness assumptions to Windows |
| `run-e2e.mjs` blocks Windows | Enable Windows |
| `sh` mock agent | Node mock agent (Unix + Windows) |
| CI E2E on non-Windows only | CI E2E on Windows leg |

No change to unit tests under `src/commands/**` or `aliveDaemonSpawnFn` patterns.

## Acceptance criteria

- [ ] `npm run test:e2e` on **Windows** (native, not WSL-only) runs all scenarios in `src/e2e/**/*.test.ts` (except purely unit files if split) and exits 0 when the tree is healthy.
- [ ] `npm run test:e2e` on **Linux and macOS** still passes (Node mock must not regress Unix).
- [ ] Auto-build when binary missing uses **`build:sea:windows`** on `win32` and **`build:sea`** elsewhere.
- [ ] Auto-detect binary path includes **`bin/lumpcode-windows-x64.exe`** on Windows.
- [ ] Mock agent uses **no `sh` / `bash` / `touch` / `mkdir -p`** in generated or inline e2e command modules.
- [ ] E2E subprocesses do not write daemon/PID/meta or `project-copies` under the developer’s real profile (`assertHomeIsolated` + DAEMON-S2 paths).
- [ ] `.github/workflows/build-cli.yml` runs **`npm run test:e2e`** on the **Windows** matrix leg with `LUMPCODE_E2E_BINARY` pointing at the built `.exe`.
- [ ] `packages/apps/cli/README.md` documents Windows E2E (commands above; no “Linux and macOS only” guard).
- [ ] No committed static `e2e-agent.js` fixture; harness still generates command modules at project setup.
- [ ] Default `npm test` (unit Vitest) remains separate; e2e stays on `test:e2e` / `vitest.config.e2e.ts`.
- [ ] Scenario teardown still stops daemons via `lumpcode stop` (no orphaned foreground children after CI job).

## Open questions and risks

| Topic | Question / risk | Recommendation |
| --- | --- | --- |
| `os.homedir()` on Windows | Setting only `HOME` may not isolate global config | Set `USERPROFILE`; add a one-line debug assertion in harness setup on first Windows CI run |
| Node in generated command modules | `process.execPath` inside written `.js` may differ from test runner vs SEA | Prefer literal `node` on PATH or inject `process.execPath` when **generating** the file string from harness TS |
| Git line endings | `core.autocrlf` may affect marker file hashes | Use binary-safe marker content; if flaky, set `git config core.autocrlf false` in `createE2eProject` for e2e repos only |
| Worktree path assertion | Backslashes vs forward slashes | Normalize both sides before `includes('.lumpcode')` and `worktrees` |
| Timeout / signals | `SIGKILL` unsupported | Use `child.kill()` without signal on Windows, or `tree-kill` if orphans appear |
| CI duration | Windows E2E slower than Unix | Accept longer job; keep serial workers; do not shard v1 |
| `test:e2e:ci` on Windows | Currently runs bash `build:sea` | Branch script on `process.platform` or document `build:sea:windows` + `test:e2e` separately |
| Product env override | If `USERPROFILE` insufficient | Last resort: document `LUMPCODE_GLOBAL_CONFIG` as follow-up; avoid unless required |
| ARM Windows | No CI leg | Out of scope; document x64-only |
| Flaky daemon cron | Same as Unix | Keep `*/1 * * * *` + polling; extend timeouts only if Windows CI proves flaky |

## Related backlog

- **`complete-e2e-binary-test`** — parent harness; this task completes the deferred “Windows E2E” section from that PRD.
- **`dedicated-dirty-env-guardrail`** — add E2E scenario after implementation; benefits from Windows harness.
- **`graceful-error-handling`** — extend E2E later for agent/git error surfaces.
- **`binary-deployment-setup`** — signing/installer separate from functional Windows E2E.
