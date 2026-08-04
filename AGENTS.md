# AGENTS.md

> Auto-maintained agent memory (Cursor continual learning). Dense, implementation-oriented — not user documentation. **Commit to git** with repo changes so collaborators and hooks share the same context. Public docs: `packages/apps/cli/DOCS/`.

## Learned User Preferences

### Code style

- Type functions with a direct `function` declaration or arrow functions; avoid `<Type>function` casts and the `const name = function name(...)` pattern
- Prefer a single destructured object argument for functions with 3+ parameters
- One type per file in `packages/core/src/types/`; types defined independently from default implementations
- Return `Success<T>` / `Failure<string>` for expected failures (`success()` / `failure()` from `@lumpcode/core`); resolve costly dynamic `import()` eagerly at configuration time, not during execution
- Use `cwd` with `execAsync`/`child_process` instead of `cd ... &&`; command functions return only the command string, pass `cwd` at the call site
- Limit change scope to specified packages; note follow-up work for other packages separately
- `@lumpcode/recipes` kit: reuse `@lumpcode/core` and exported `@lumpcode/cli-utils` helpers (`normalizeSteps`, `readYamlList`, …); lift CLI-only shared utils into `cli-utils` rather than duplicating in recipes — async-only when sync wrappers add no call-site value; recipe step types use CLI `LumpJsConfigSteps`, not core `Steps`; multi-file kit utils live under `src/kit/<name>/{main.ts,index.ts,unit.test.ts}` (single-file `src/kit/<name>.ts` OK for small helpers); barrel-export from `kit/index.ts`; do not invest in sharing implementations with deprecated `ymlBacklogContexts`/`setTaskDoneStep`
- CLI utils live flat under `packages/apps/cli/src/utils/` (one util per directory: `main.ts` + `index.ts`, barrel-exported from `utils/index.ts` — no nested subdirs). Shared test-only helpers go under `packages/apps/cli/src/testing/` with a barrel `index.ts`. Prefer a private inline helper in the calling module over a new util directory for small single-caller logic
- Name path-lock release callbacks `releaseLock`, not phase-specific names (e.g. `phase1Lock`); enforce each guard/skip at one canonical layer — do not duplicate the same check in both `runLumpFromLumpName` and `runLumpFromJsConfig`

### Testing

- Prefer integration tests with real fixtures over mocking; test behavior, not implementation; avoid unnecessary dependency injection (mock the underlying API instead); do not inject TTY detection unless there is a strong reason; when extending coverage, prefer updating/augmenting existing tests over wholly new cases when substantive candidates exist
- Temp git repos: set local `user.name`/`user.email` before `git commit` (CI runners lack global identity)
- File writes: use the temp `projectRoot`/`tmpDir`, not process `cwd`, so teardown removes them
- TS transpile tests: assert `.lumpcode/.cache/transpile/` cache hits (`readCacheMeta` in `tsLumpFixtures.ts`) — Node 22 Vitest can natively import temp `.ts`, which false-greens `resolveImportable` tests before esbuild wiring; Vitest aliases `esbuild` to `src/testing/esbuildVitestShim.ts`
- Not-yet-implemented utils: add index-barrel-exported stubs (throwing `not implemented`) plus the types tests import so tests compile and run red until implementation lands; backlog `testImpl` / tests-only work keeps future suites skipped and must not change production code to green them — unskip during the implementation stage
- Core process-tree unit tests share `packages/core/src/testing/processTreeTestHelpers.ts` (`probeAlive`, `waitForPidGone`, `waitForReadyFile`) — reuse across `killProcessTree` / `execBinary` / timeout-abort suites instead of duplicating wait helpers
- Large helper/command suites may colocate under `<name>/testing/` (first: `executeStepsForContextList/testing/`, CLI: `commands/start/testing/`, `utils/jsConfigToRunLumpInput/testing/` — `general.unit.test.ts`, topic files, `testHelpers.ts`); keep `main.ts`/`index.ts` at the module root; exclude `**/helpers/**/testing/**` (core) and `**/commands/**/testing/**` + `**/utils/**/testing/**` (CLI) from package tsconfig emit
- Backlog `testPlan.md` locations (`**Where:**`, host tables) cite package-rooted paths (e.g. `packages/core/src/helpers/<name>/testing/general.unit.test.ts`), not bare `unit.test.ts`

### CLI docs and vocabulary

- Keep user-facing docs (`README`, `DOCS/`) aligned with real CLI behavior; avoid internal implementation detail unless an operator truly needs it. Position Lumpcode as a **loop engineering** tool (term woven once into root/CLI READMEs + `concepts.md`; `loop-engineering` npm keyword on cli/core/cli-types) — one mention per surface, not keyword stuffing
- Publishable package READMEs (`@lumpcode/recipes`, `@lumpcode/cli-utils`, …) are operator-facing: no "private monorepo" or "Published …" status framing; point to `@lumpcode/cli` as the main install when the package is an add-on
- **Lump**: configured long-running agent loop campaign (`.lumpcode/lumps/`, `lumpcode run`); large body of work too big for one chat — both repetitive edits (migrations, codemods) **and** planned feature roadmaps; avoid "set up once" framing (project setup is followed by recurring per-lump authoring)
- **LUMP** backronym: Loop Using Multiple Prompts
- Human review via **PR merge**, not vague "human review"
- Three workspace terms: **project workspace** (`projectRoot`), **execution workspace** (`executionWorkspacePath`; git repo root after pre-flight), **branch workspace** (`workspacePath` on core `CommandFn` / `SetupWorkspaceFn` return — agent + per-context git cwd)
- Tutorials (e.g. `DOCS/get-started.md`) must be **self-contained**; links are optional depth only
- `concepts.md` intro is user-facing — definitions go in **Core terms**, not writer-only Terminology sections
- Prefer periods/commas over em dashes in README/DOCS when not necessary
- Document cross-lump **`dependsOnContexts`** in CLI DOCS only (`<otherLumpName>/<contextName>`; context `name` must not contain `/`); `packages/core/README.md` stays core-only
- Root `README.md`: early-development disclaimer; `assets/lumpfish.png` after the lumpfish blockquote
- npm-published `packages/apps/cli/README.md` doc links: absolute GitHub URLs to `packages/apps/cli/DOCS/...` (relative `DOCS/` hrefs 404 on npmjs.com); keep relative links inside `DOCS/` for GitHub browsing
- When CLI flags change, document only the current spelling — no migration guides unless the user asks
- `lumpConfig.schema.json` is part of the user-facing docs surface (editors read it via `$schema`) — keep descriptions, examples, and field coverage aligned with real CLI behavior, same as README/DOCS
- Cross-cutting topics (e.g. branch resolution, concurrency/locks) get **one canonical section in `concepts.md`**; other pages link there instead of re-explaining — avoid duplicated prose that drifts
- `AGENTS.md` continual-learning: capture durable principles and workspace facts, not session change logs or verbatim grilling Q&A outcomes

### CLI conventions

- Unregistered `login`/`logout` command modules are **implementation-only** — do not document in user-facing README/DOCS (`npm login` in `DOCS/publishing.md` is npm registry auth only)
- Arguments before options in usage; long option names in camelCase (e.g. `--lumpName`, `--contextName`, `--lines`) to match Commander/schema — avoid single-char keys needing special `addCommand` handling
- Lump-config `command` field: registered tag (`"copilot"`, `"cursor"`, …) **or** lump-relative `.ts`/`.js` path (no whitespace; same `CommandModule` exports as `commands/<name>`); never shell flags — agent flags belong in the module's `CommandFn` (`executable` + `args`)
- Lump configs: omit CLI-default fields (`numberOfContextsPerBranch: 1`, `verbose`/`keepHistory` off); keep only intentional overrides
- Omit boolean flags for defaults; pass once for the non-default — no `--<name> true|false` or legacy two-token boolean argv

### npm publish

- Publishable `package.json` files: include `repository` (link to `lumpcode/lumpcode`) and relevant `keywords`
- Version/publish scripts (`scripts/set-npm-versions.mjs`, `scripts/publish-npm.mjs`) share catalog `scripts/npm-packages.mjs` (ids: `core`, `cli-types`, `cli-utils`, `recipes`, `cli`, `lumpcode`); `--packages` selects a subset (omit = all); `--ignore-packages` excludes ids after that selection (same aliases/forms; errors if selection empties); selective bumps only rewrite internal `@lumpcode/*` deps when both ends are in the selection; version early-exit must compare every selected package, not only `core`
- `@lumpcode/cli` `files` must ship the full postinstall chain (`scripts/esbuild-sidecar.mjs`, `scripts/native-binary.mjs`, `scripts/postinstall.mjs`)
- Before publish: smoke-test the packed tarball (`npm pack --dry-run | rg scripts/`, extract, `import './scripts/native-binary.mjs'`, `LUMPCODE_SKIP_BINARY=1 node scripts/postinstall.mjs`)
- Release PRs to `main`: use merge commit, not rebase merge — rebase rewrites SHAs so the release branch is not an ancestor of `main` (identical tree, phantom follow-up PR)

## Learned Workspace Facts

### Monorepo layout

- npm workspaces (**not** pnpm): `packages/core` (`@lumpcode/core`, Apache 2.0 — `runLump` executes one agent loop per invocation), `packages/apps/cli` (`@lumpcode/cli`, Apache 2.0 — ncc bundle from `root.ts` only, **no programmatic library entry**; primary user install), `packages/apps/cli/cli-types` (`@lumpcode/cli-types`, published — canonical types + `define*`), `packages/apps/cli/cli-utils` (`@lumpcode/cli-utils`, published — single root barrel re-exporting `cli-types` + runtime helpers; utils bundled from CLI src at build, `cli-types` external at publish), `packages/recipes` (`@lumpcode/recipes`, published — single root barrel: recipes + kit + recipe types; monorepo imports `@lumpcode/cli-utils` only), `packages/libs/ui` (private WIP)
- Authoring stack: `cli-types` and `cli-utils` coexist on npm; prefer `@lumpcode/cli-utils` for new consumer-facing types (`cli-types` soft-aligned until a later deprecation); `.lumpcode/lumps` remain on `cli-types` until the docs branch updates them
- Core layout: `types/` (barrel via `index.ts`), `usages/runLump/`, `helpers/`, `utils/`
- `@lumpcode/core` must not depend on `zod` (dropped; `ContextStatus` is a plain const tuple) — rollup-external zod without a package.json dep broke project-local recipe configs that resolve published core from `node_modules` (global CLI ncc hid it)
- Stack: TypeScript, Commander.js, Zod (CLI only), Vitest; agent-agnostic (Claude, Codex, Aider, Copilot CLI, etc.)

### Core domain model

- **Project**, **Lump**, **Context**, **Steps** (recursive), **Recipe**
- Context status from commit messages on remote refs (`gitCommitMessageFn`; default core: `LUMP:${context.name}`; CLI: `getGitCommitMessage({ contextName, lumpName })`): `toDo` → `branchPushed` → `finished` (remote is source of truth)
- `getToDoContextList` validates names via `validateContextListNames` (unique, `^[a-zA-Z0-9_-]+$`); resolves status via `contextStatusMap.get(context.name)` (not parallel-list index) because `dependsOnContexts` can insert names absent from `contextList`
- Cross-lump `dependsOnContexts`: composite `lumpName/contextName`; CLI `makeGitCommitMessageFnFromLumpName` maps `/` in dependency refs to `LUMP:<referencedLump> - <contextName>` — slash only for dependency refs, not same-lump context names
- Lump config precedence: **`config.ts` > `config.js` > `config.json`**; hook `*Fn` paths and custom commands support **`.ts`**; shipped presets stay **`.js`** only; `lump-create` scaffolds JSON/JS only
- Per-lump `disabled`: boolean, zero-arg sync/async fn, or `FilePath` to a module — phase 1 returns `{ skipped: true, reason: 'disabled' }` (exit 0 on manual `run`); daemon `runTick` logs info and continues; no `enable`/`disable` subcommands

### Context sourcing (mutually exclusive)

- `contextListJson` (static JSON), `getContextListFn` (dynamic), or `contextMatchFn` (file scanner)
- `contextMatchFn`: each call gets `codeBasePath`, full `codeBasePaths`, `lumpVariables`; same `contextName` merges (variables accumulate; later match wins duplicate keys/`contextOptions`)
- CLI `GetContextListFnInput`: `codeBasePaths` + `lumpVariables` + concrete `discoveryBranch` (core omits discovery; CLI adapts at the run boundary) — no `projectRoot`/`baseBranch`; daemon/CLI discovery matching selects lumps only — per-branch context filtering belongs in the author's `getContextListFn` / recipe `resolveItem`

### Engine execution

- `executeStepsForContextList`: recursive/dynamic `steps` walk inline (each leaf: `promptFn` → `commandFn` → command → `postCommandExecFn` before next item)
- Per-context lifecycle: `branchFn` (once) → `setupWorkspaceFn` (once) → per context: `setupFn` → prompt loop → `teardownFn` → `git add` + `git commit` → finally `git push` (once) + `teardownWorkspaceFn` (once). After successful workspace setup, `teardownWorkspaceFn` always runs on any exit (step-walk failure/abort, git add failure, throw, success); per-context `teardownFn` always runs after that context’s walk attempt (soft-fail: catch + `logger.error`, never blocks git / never becomes the returned Failure). On `stepWalkFailure` (incl. abort): skip git for that context, remaining contexts, and push; return `reason: 'stepWalkFailed'`. Lone workspace-teardown command failure → `reason: 'workspaceTeardownFailed'` (if a step-walk failure was already recorded, keep `stepWalkFailed`). Push still log-only on failure. Success order: walk → `teardownFn` → git → (other contexts) → push → workspace teardown
- `contextRunState`: single plain object per context (`setupResult?.contextRunState ?? {}`); engine never freezes/clones/replaces it; command-module `setup` seeds at `<commandName>Setup`
- `PostCommandExecFn` gets `commandSucceeded: boolean`; `Step.continueOnError` (default false) allows non-zero exit to continue; `CommandDescriptor.env` merges over `process.env`
- `collectStepsForContext` is plan-preview only (`planLumpFromJsConfig`); `*-on-copy` presets keep `projectRoot` as source repo and use an absolute copy path as branch `workspacePath`
- A `steps` item need not be an agent prompt: `promptTemplate`/`promptFn` are optional (omit → command runs with an empty prompt string); an inline `commandFn` returns `{ executable, args, env? }` (or `null` to skip) for plain shell/build/validation commands — the basis for verification/retry loops (`loop-example`, `getRecursiveSteps`)
- `runLump` calls `getToDoContextList` once before workspace setup; `getContextListFn`/`getContextStatus` read source `projectRoot` before `setupWorkspaceFn` switches branch — shared mode pre-flight never touches source
- `keepHistory: true` → `.lumpcode/lumps/<lumpName>/history/<contextName>.yaml`; `fs.mkdir` before initial `[]` write; `project-setup` gitignores `.lumpcode/**/history/` and `.lumpcode/.cache/`; append failures log `logger.warn` and do not abort the step walk; writes sanitize ANSI/C0 controls from `prompt`/`commandResult` (read-side recovery for corrupt files)
- Default branch prefix: `lump/${lumpName}/` (`LUMP_BRANCH_PREFIX`); custom naming via `branchFn` (CLI default: one context → `lump/<lumpName>/<contextName>`; multiple → sorted names + SHA-256, first 12 hex)
- Default git: push branch only (no tags); `git commit --allow-empty`; messages/branches wrapped with `shellSingleQuote`; only `gitCommitMessageFn` is a surfaced user knob (`LumpJsConfig` omits it; CLI defaults via `getGitCommitMessage`)
- `execBinary`: object API (`binaryPath`, `args`, optional `timeoutMillis`/`cwd`/`env`/`stdio`/`signal`/`killGraceMs`); `resolveSpawnExecutable` on Windows; npm/yarn `.cmd` shims for Node CLIs unwrap to `node <entry.js> …args` so multiline/backtick prompts are not mangled by `cmd.exe`/`%*` — Node is shim-dir `node.exe` else PATH `node` (never SEA/`process.execPath` unless basename is `node`, never a Node `.cmd` shim; bare `"node"` last resort so missing Node is ENOENT, not a silent cmd.exe wrap); same Node resolver for extensionless/shebang Node scripts; plain `.cmd`/`.bat` (no recognizable `.js` target) still wrap through `cmd.exe /d /s /c`; handles spawn `error` events for structured failures; resolves on spawn `'close'` (exit + stdio closed); on `timeoutMillis` or `AbortSignal`, tree-kills via `killProcessTree` (`killGraceMs` default 5000) then fails with `reason: 'timeout' | 'aborted'`; `RunLumpInput.signal` threads through `executeStepsForContextList` → `execBinary`; abort ignores `continueOnError`; step walk spawns with `stdio: ['inherit', 'pipe', 'pipe']` so inherited stdin or lingering pipes (e.g. `npx` wrappers) can block completion after the inner command finishes
- Process kill helpers live in `@lumpcode/core`: `killProcessTree` (`graceMs` default 0 → immediate SIGKILL / taskkill `/T /F`), `isProcessAlive`, `nodeErrnoCode` — CLI imports from core (no local copies)

### CLI project config

- Project root: directory with both `.lumpcode` and `.git`; engine `projectRoot` = parent of `.lumpcode/` (`jsConfigToRunLumpInput` derives from `localConfigFolderPath`)
- **`project.json`**: `projectName` (letters, digits, `_`, `-` only); inferred from `git remote get-url origin` or sanitized basename on `project-setup`; used for daemon filenames and `project-copies/<projectName>/`
- **`.lumpcode/local.json`** (gitignored; scaffolded by `project-setup --mode`): **required** for `run`/`start` — `mode` (`shared` | `dedicated`), `primaryBranch` or `primaryBranches`, optional deprecated `projectBaseBranch` alias (warn once via `resolvePrimaryBranches` when logger passed), optional `workspaceStrategy` (`checkout` | `worktree`, default `checkout`), optional `disabled` (boolean — daemon skips all lumps on machine; manual `run` unaffected), optional `maxParallelRun` (positive int; default `1` — global-daemon concurrency only when `workspaceStrategy` is `worktree`; checkout warns once and stays sequential). No `--mode`/`--force` on `run`/`start` — edit `local.json`. Read once at daemon startup (restart to pick up changes). When the repo integrates on `dev`, set `primaryBranch`/`primaryBranches` to `dev` so lump branches and context status track the integration branch

### Branch resolution (v0.0.9)

- Split **execution** (`baseBranch`) from **discovery** (`discoveryBranch` / `discoveryBranches`, mutually exclusive; exact and/or git refname globs); design ref: `.lumpcode/lumps/v0.0.9/multi-project-base-branches.reference.md`
- `effectivePrimaryBranches` = non-empty `primaryBranches` else `[primaryBranch]`; resolved `primaryBranch` = first
- `resolvedDiscoveryBranch` = concrete discovery (CLI `--discoveryBranch`, else first exact discovery rule, else `primaryBranch`); pattern-only `discoveryBranch(es)` require `--discoveryBranch` for manual `run`/`lump-plan`/`lump-status`
- `resolvedBaseBranch` = lump `baseBranch ??` concrete discovery `?? primaryBranch`
- `resolvedBaseBranch` on `RunLumpInput` drives context status and worktree fetch; pre-flight/teardown use `resolvedBaseBranch`
- **Dedicated allowlist**: each discovery rule must be allowlisted against configured (unexpanded) `effectivePrimaryBranches` — enforce in **`runLumpFromJsConfig`** and explicit `--lumpName` daemon launch (`validateLumpDiscoveryBranchAllowlist`); redundant in dedicated global **`validateDaemonLaunch`** loop after `discoverDedicatedLumpsForScanBranch` (helper filters by scan branch); not `baseBranch`; command handlers must not duplicate
- **Shared mode**: no allowlist; lump `discoveryBranch`/`discoveryBranches` and `--discoveryBranch` ignored for scheduling; multi-`primaryBranches` logs once (dedicated-only feature); executes on copy at `resolvedBaseBranch`, discovers from source `projectRoot`
- Dedicated daemon: loops `effectivePrimaryBranches` per tick; same `lumpName` on different primary branches OK; duplicate `lumpName` on same primary-branch scan fails launch
- `lump-plan`/`lump-status`: non-destructive (no pre-flight); manual `run` requires lump config on current checkout

### Workspaces and pre-flight

- **Execution workspace** (`executionWorkspacePath`): project copy in `shared`, operator checkout in `dedicated`
- **Branch workspace**: mapped to core `workspacePath` via `makeLumpWorkspaceFns` → `setupWorkspaceFn` (checkout or worktree; not `runProjectPreflight`); worktrees at `.lumpcode/worktrees/<branch-as-nested-dirs>/` under execution workspace (CLI-only; engine `cwd` stays source `projectRoot`)
- Checkout strategy: `atDirectory(executionWorkspacePath, …)` (`cd /d` on win32). Worktree strategy: `git -C <executionWorkspacePath>`, `shellSingleQuote` on slash branch names, `shellBestEffort` for best-effort steps, platform-specific rm, `mkdir` worktree parent before `git worktree add` on Windows
- **`runProjectPreflight` / `runPreflight`**: execution-workspace only — fetch/switch/hard-reset/pull; no branch-workspace preflight. Lump-run hook in `withWorkspaceLockHooks` targets **`resolvedBaseBranch`** (not `resolvedDiscoveryBranch` except when they coincide); daemon discovery uses a separate call with **`scanBranch`** in `discoverDedicatedLumpsForScanBranch`
- Shared mode copy reuse: compare source vs copy `origin` URLs; `git remote set-url`/`add` on mismatch only (fresh `fs.cp` skips — inherited remote correct). `git fetch --all` alone cannot fix wrong `origin` URL
- No dirty-tree guard yet — dedicated mode can wipe uncommitted work
- `maximumNumberOfConcurrentBranches`: enforced only in `runLumpFromJsConfig` via **`evaluateTooManyOpenBranchesSkip`** (`countOpenLumpBranches` at execution workspace, `git ls-remote --heads origin` for `lump/<lumpName>/*`); limit reached → `skipped` variant; not duplicated in phase 1

### Workspace locks (CLI-only)

- **`workspacePathLock`**: single namespace per `path.resolve` (`workspace-path-locks/`); **`workspacePathBusy`** failure; manual `run` `lockMode: 'fail'`, daemon `wait`; atomic `wx` only (no FIFO v1)
- **`run` / `start`** call **`runLumpFromLumpName`** (phase 1) → **`runLumpFromJsConfig`** (phase 2); tests may call `runLumpFromJsConfig` directly with `jsConfig`
- **Phase 1** (dedicated): `preflightDiscoveryBranchWithLock` → load config + disabled soft skip; checkout keeps lock into phase 2; worktree releases after validation
- **Phase 2**: `withWorkspaceLockHooks` — baseBranch preflight at setup; checkout continuous hold; worktree hold execution through setup then swap to worktree path lock via **`withSetupWorkspaceAfterExec`**
- Phase-1 **`releaseLock`** handoff → adopted into `session.releaseExecutionPathLock` at **`runLumpFromJsConfig` entry**; `try/finally` + **`releaseWorkspaceLockSession`** releases on all early returns (including **`tooManyOpenBranches`**)
- Disabled lump soft skip in phase 1 must call **`releaseLock`** before return (phase 2 not invoked)
- **`--discoveryBranch`** on `run` and `start --lumpName`; **`resolveEffectiveDiscoveryBranch`** (discovery only, not `resolvedBaseBranch`); global/shared warn-and-ignore
- **`discoverDedicatedLumpsForScanBranch`**: short-lived locked preflight per `scanBranch` with lock holder **`DISCOVERY_SCAN_LOCK_HOLDER`** (`__discovery__`); global tick re-runs phase 1 per lump
- `workspaceFileLock` is internal — barrel-export `workspacePathLock` only
- Force-killed daemons (`stop --force`) may leave path locks; next acquire removes stale locks when holder PID is dead — no stop-time lock cleanup
- Do not duplicate core planning in CLI for lock keys (no pre-run `getToDoContextList` or `branchFn`)

### Daemon

- `start` detaches by default (`--foreground` to block); companions: `stop`, `restart`, `daemon-log`, `daemon-status`; optional `--lumpName` scopes PID/log/meta
- PID/meta JSON written **only in `--foreground`** (detached parent spawns foreground child)
- `daemon-status`: PID file + alive process; `daemon-log`: log file exists (can `tail -f` after exit)
- Croner `{ protect: true }` + `await runTick()` — long tick blocks next fire; within a tick, global daemon drains lumps via **`runLumpQueueWithConcurrency`** (`maxParallelRun` when `workspaceStrategy` is `worktree`, else concurrency `1`)
- **`discoverLumpNames`** / **`discoverLoadableLumps`** / **`discoverLoadableLumpNames`**: all lump dirs vs single-pass loadable `{ lumpName, jsConfig }[]` (optional `logger` warns invalid dirs); names-only wrapper — used by `start`, `validateDaemonLaunch`, `resolveTargetLumpNames`, `lump-status`, `discoverDedicatedLumpsForScanBranch`
- **`discoverDedicatedLumpsForScanBranch`**: dedicated discovery helper — locked preflight to `scanBranch`, then `discoverLoadableLumps`, then filter by `resolvedDiscoveryBranch`; used by daemon tick and `validateDaemonLaunch`
- **`validateDaemonLaunch`**: filesystem-only at start (allowlist, duplicate-name); dedicated global daemon locked preflight per `primaryBranches` before discover; dirs without config → `logger.warn` and skip (explicit `--lumpName` without config still fail-fast); fail-fast on same-primary duplicate `lumpName`, unlisted discovery branch, discovery preflight failure
- Tick (dedicated global): loop `primaryBranches` → locked discover per branch into one eligible queue (record `scanBranch` per `lumpName`; skip branch failures / duplicate names / `ignoredByGlobalDaemon`) → `runLumpQueueWithConcurrency`; pass queued scan branch as `effectiveDiscoveryBranch` into `runLumpFromLumpName` so phase 1 can load branch-only configs after the checkout moved
- Manual `run`: no daemon PID gate — coordinates with running daemons via workspace locks only (`lockMode: 'fail'` vs daemon `wait`); dedicated `dedicatedRestoreBranch` `git switch` in handler `finally` runs after lock release (not serialized with daemon preflight)
- `daemon-status` / `stop`: single scope only (global or one `--lumpName`); no list-all/stop-all — internal `listRunningProjectDaemons` used by `start` collision checks only
- Default `stop` refuses when mid-run (`isDaemonMidRun` / `daemonBusy`) or when meta is missing/invalid (`daemonMetaCorrupt`); idle SIGTERM waits **5s**; `--force` tree-kills with `graceMs: 0` and does **not** require readable meta
- `readDaemonMeta` fails closed (`missing` / `invalid` / `io`) — never invent checkout/idle from a missing file; valid meta may still default omitted `workspaceStrategy` to `checkout`
- Alive PID + bad meta: `listRunningProjectDaemons` returns `{ meta: 'missing'|'invalid' }` (no strategy); `assertDaemonStartAllowed` / `start` refuse with `daemonMetaCorrupt`; `restart` uses `stop --force` then start; in-flight meta updater skips write + `logger.warn` on read failure
- Foreground daemon arms native SIGINT/SIGTERM shutdown **before** the first `runTick` (so `stop` during that tick does not hang waiting for a second signal); test `waitForShutdownOverride` still runs after the first tick to avoid racing meta `inFlightLumpCount` writes
- Meta mid-run: writers bump **`inFlightLumpCount`** per lump in `runOneLump` `try/finally` (not whole tick or discovery); `busy` is deprecated read-only for upgrade safety — prefer `isDaemonMidRun` / parsed `readDaemonMeta` over inlined predicates
- Global daemon: fails if any project daemon running. Per-lump: fails if global running, same lump running, or other per-lump running when `workspaceStrategy` ≠ `worktree`
- `daemon-log`: follows by default; `--noFollow` prints and exits; `--lines` limits initial output
- Cross-lump `dependsOnContexts`: warns when `otherLump.baseBranch !== thisLump.baseBranch`
- Treat `.lumpcode/` configs and command modules as trusted executable code

### Command modules, presets, and TS transpile

- Custom commands in config `commands/` folders export `command`, `setup`, `teardown`; local config precedes global; probe **`.ts` before `.js`**
- Presets: `presets/<name>.js` only; installed to `~/.lumpcode/commands/presets/` via `installPresetCommands` (first `run`/`start`/`lump-plan` copies missing only; `reset-presets` overwrites). Plain ESM — no `@lumpcode/core` imports; Node builtins + relative `./utils/` only
- Lump-local `.ts` transpiles via **`transpileTypeScriptToCachedMjs`** (esbuild → `.lumpcode/.cache/transpile/<sha256>/<cacheKeyMs>/out.mjs`); bundle relative imports with `packages: 'external'`; post-process rewrites `import.meta.url`; **`ensureCacheGitignored`** on first transpile
- Use **resumable** (not "idempotent") for run behavior; presets persist chat/session id in `contextRunState` and `keepHistory`
- **Cursor/Copilot presets**: headless (`-p`, no user prompts); `.trim()` prompts, `null` for whitespace-only; resumable sessions in `<commandName>Setup`; Copilot denies agent `git commit`/`git push`
- Preset options (**`model`**, **`agentPermissions`**) on `lumpVariables`/`stepVariables`: **step overrides lump**, `model` defaults to `auto` for cursor/copilot (claude-code/opencode/codex omit the flag when unset — Claude Code and ChatGPT Codex both reject `auto`); step-only session keys `newChat`/`chatIdIndex`; Cursor `cursorConfigDir`; Copilot `writablePaths`/`denyShell` → `--allow-tool`/`--deny-tool`; callback `stepIndex` is `number` at depth 1 or `number[]` when nested
- Codex/OpenCode session bootstrap (`createCodexSession` / `createOpenCodeSession`): use **`execFileIgnoreStdin`** (end stdin) — default `execFile` pipes stdin and Codex hangs on `Reading additional input from stdin...`; Codex argv is `codex exec <options> resume <session> <prompt>` — parent `exec` options (`--sandbox`, `--add-dir`, `--model`) must precede `resume` (`codex exec resume` rejects `--sandbox` after positionals)
- `resolveImportable`: Vitest uses native `import(fileUrl)`; bundled code uses `dynamicImportForBundle` (Windows SEA requires `file://` URLs)
- Lump-config `*Fn` paths resolve relative to `.lumpcode/lumps/<lumpName>/`
- `promptTemplate` (`FilePathOrString`): resolve relative to `.lumpcode/lumps/<lumpName>/`; file ref only when entire string has no whitespace and ends with `.txt`, `.template`, `.prompt`, or `.md` and path exists (read once at config load; missing → fail); otherwise inline template text (`{VAR}` / `@{VAR}` unchanged). Prompt placeholders resolve from **context** variables, not from `lumpVariables`/`stepVariables` (those carry preset options and hook inputs). `command` file ref: no whitespace, ends with `.ts` or `.js`, exists under lump dir → `CommandModule` import; else tag lookup; `commandName` = literal config string; `registerCommands` tag-only
- `getCommandPath`: explicit local/global config paths only (no implicit `~/.lumpcode` fallback)
- `getContextStatus` CLI wrapper wires `makeGitCommitMessageFnFromLumpName(lumpName)`

### CLI framework

- Global options (`--json`, `--verbose`) on root program; subcommands read via `command.parent.opts()`; `lump-status` uses `--silent` for summary-only output
- `cliLog`: result envelope only; `--json` → one compact JSON line per invocation
- `addCommand`: injectable `exit(1)` on handler `Failure` and Zod parse failure
- Logger: `error` always prints (even with `--json`); `--json` suppresses other operational lines; CLI `--verbose` OR-merges lump-config `verbose`; `createCliLogger` prefixes `[lumpcode]`
- Shell escaping: `shellSingleQuote` from `@lumpcode/core` for user-controlled values; `shellBestEffort` for best-effort fragments
- Lump config has **no** user-facing workspace setup hooks — CLI generates workspace fns from `local.json` + per-lump `baseBranch`
- `LumpJsConfig` and related step/config types are dual-generic `<V extends LumpVariables = LumpVariables, SV extends StepVariables = StepVariables>`; authors refine with explicit type args at `defineConfig`/call sites (TS rarely infers from `lumpVariables`/`stepVariables` bags); defaults keep untyped configs working
- `LumpJsConfigSteps` is always an array of `LumpJsConfigStepsItem` (step object | `StepFn`/`LumpJsConfigStepsFn` | `promptTemplate` — no bare `promptFn`; those only via `prompt` or a step object); config `steps?: LumpJsConfigSteps | LumpJsConfigStepsItem` allows a solo item in JS/TS; private `prompt` solo type stays step | template | `promptFn`; `StepFn` exported via `cli-types`/`cli-utils`, input `Omit<PromptFnInput, 'stepVariables'>`, may return array or solo item; `normalizeSteps` always returns an array (solo fn → `[fn]`; other solos promote via the `prompt` wrap path; solo `steps` wins over `prompt`); JSON schema still requires an array

### Distribution, build, and CI

- **Primary install**: `npm install -g @lumpcode/cli` (Node 22+); unscoped `lumpcode` meta package optional, not user-documented; `install.sh`/`install-local.sh` are optional channels — `--name` for alternate symlink when npm + standalone coexist
- Recipe-based JS configs need resolvable `@lumpcode/recipes` under the project (global CLI does not provide package resolution); non-JS repos use a minimal root `package.json` + `npm install @lumpcode/recipes`, or skip recipes and write plain `config.json`/`config.js`
- `bin/lumpcode.js`: native binary when present, else `node dist/index.js`; `--version` reads `package.json` via static import in `main.ts`; `clean` removes only SEA outputs under `bin/` (not the launcher)
- `postinstall` reinstalls presets + downloads native binary to gitignored `vendor/` — skips in CI, monorepo dev (`src/root.ts` present), missing `dist/`, or `--ignore-scripts`; `LUMPCODE_SKIP_BINARY=1` skips binary only; `DEFAULT_INSTALL_REPO` in `native-binary.mjs` still `YOUR_ORG/Lumpcode` until wired to `lumpcode/lumpcode`
- Local debug: `build:dev` (core skips `.d.ts`; CLI ncc with source maps, no minify) then `NODE_OPTIONS='--enable-source-maps' node dist/index.js` from target project cwd — not SEA or npm launcher resolving to `vendor/`
- SEA: minified `build:bundle` (uncaught errors can dump the one-line bundle); sidecars (`schemas/`, `presets/`, esbuild binary) beside `process.execPath`; `validateLumpJsonConfig` reads schema beside binary; embed static assets when feasible; macOS binaries ad-hoc codesigned only (strip quarantine xattr or sign + notarize for distribution)
- Git flow: canonical operator doc `GIT-FLOW.md` at repo root; `dev` integration branch; larger work on `feat/*`; version releases merge `dev` → `main` with annotated `v*` tag (optional `ver/X.Y.Z` stabilization branch from `dev` avoids freezing integration); rebase feature branches onto `dev` only — merge commits (not rebase) across the `dev`/`main` boundary
- CI (`.github/workflows/build-cli.yml`): triggers on push/PR to `main` and `dev`; `unit-test` build order core → cli-types → cli-utils → recipes (their `dist/` is gitignored), each followed by `npm run test -w=...` (recipes included) → OS `build` matrix → aggregating `ci` job; E2E on ubuntu/macOS/windows including arm; isolated `HOME`/`USERPROFILE` per platform; both `main` and `dev` protected via repository rulesets requiring `ci` status check
- E2E: `packages/apps/cli/src/e2e/` subprocess harness; plain `test:e2e` / `test:e2e:node` reuse an existing SEA binary or `dist/` without rebuild (`ensureSeaBinary` / `ensureNodeBundle`) — after daemon/bundle changes use **`test:e2e:ci` / `test:e2e:ci:node`** (or delete the binary/`dist`) so local runs match CI’s fresh `build:bundle`/`build:sea`; mock agent via `e2e-mock-agent.cjs` script file (not `node -e`); `pushIntegrationBranch` needs full `writeE2eLumpFixture` (config-only writes wrong lump path)
- E2E teardown: `stopDaemonSafely` should pass `--force` so teardown does not race mid-run meta; treat stale/invalid PID stop messages as already-stopped; `waitForDaemonIdle` uses `isDaemonMidRun` and requires a mid-run→idle cycle (not merely current idle) before graceful-stop assertions — otherwise stop can race the first tick before shutdown is armed
- `killProcessTree` (core; win32): `taskkill /T /F` can fail on SEA child trees ("operation not supported") — treat as success when the root PID is already gone (best-effort per PRD); `graceMs > 0` uses SIGTERM-then-SIGKILL on Unix
- ncc emits CJS — use `lodash/camelCase` not `lodash-es`; `build:bundle` externalizes `esbuild`; SEA spawns esbuild sidecar via `execFile` (`esbuildPlatformBinaryRelativePath`: Windows `@esbuild/win32-x64/esbuild.exe`, Unix `bin/esbuild`)
- **OSS**: Apache 2.0 at `lumpcode/lumpcode`; no feature gates or account required; ICLA/CLA Assistant before external contributions; publish order: core → cli-types → cli-utils → recipes → cli → optional `lumpcode` via `scripts/publish-npm.mjs`; release branches `ver/X.Y.Z`, annotated tags `vX.Y.Z` — tag push (`push: tags: ['v*']`) triggers Build CLI Binaries and the `release` job uploads binaries to a GitHub Release (`softprops/action-gh-release`); npm publish is separate

### Repo backlog

- `backlog` lump (`.lumpcode/lumps/backlog/`): uses `featureBacklog` recipe — phased feature flow `makeReq` → `makeTestPlan` → `testImpl` → `implementation`; `backlogItems/todo|completed/<name>/` with `desc.yml`, `requirements.md`, `testPlan.md`
- `todoStackPrds` lump: `TODO.yml` / `DONE.yml` under `.lumpcode/lumps/todoStackPrds/`
- Version planning: `.lumpcode/lumps/v0.0.7/`, `v0.0.8/`, `v0.0.9/`; long-horizon ideas in root `IDEAS.yaml`
- Tasks: `name`, `task`, `priority` (lower = sooner), optional `dependsOn`, optional `manualReq`; `backlogItems/todo/<name>/requirements.md` and `testPlan.md` gate stages; item names must not end in `_req`, `_testPlan`, or `_tests_impl`
- `@lumpcode/recipes` two layers: **recipes** (`backlog`, `featureBacklog`, `abstractionFinder`, `abstractionBacklog` — config from params) and **kit** (`src/kit/` — shared plumbing, barrel-exported; folder modules or single-file helpers); path-resolving recipes need lump `configUrl: import.meta.url` (derive lump dir via `fileURLToPath` + `lumpPathAndName` — never `path.join(import.meta.url, …)`); `defineRecipe`/`defineConfig` and engine hooks do not expose caller `lumpName` to recipe factories or `getContextListFn`; exported recipes/`defineRecipe` and variable-carrying kit (`retryUntilGreen`, `getRecursiveSteps`, …) must preserve caller dual generics `<V, SV>` with defaults (untyped `featureBacklog({…})` stays valid); context-list kit (`folderBacklogContexts`, `ephemeralContextListFn`) takes `<V>` only — not `SV`
- `backlog` recipe: typed stage map (`stages` + `resolveItem`); `resolveItem` receives concrete `discoveryBranch` from each context-list call (for per-scan staging/ignore); injects `TASK_NAME`, `TASK`, `BACKLOG_ITEMS_DIR`, `BACKLOG_ITEM_DIR`, `BACKLOG_STAGE`; `moveToDone` stages append `folderSetTaskDoneStep` (rename `todo/<name>/` → `completed/<name>/` first, then stamp `completedAt` on the completed `desc.yml`; `continueOnError: true` so move failures do not abort the lump); reserves `getContextListFn`/`steps`; optional project-root-relative `backlogItemsDir` override
- `featureBacklog`: requires `configUrl: import.meta.url`, `baseBranch`, `implValidateCommand`; legacy context names `<name>_req`, `<name>_testPlan`, `<name>_tests_impl`, then unsuffixed `<name>`; `manualReq: true` waits for human requirements; only merged `tests_impl` unlocks implementation; `testImpl` marks both new and updated cases with `it.skip`/`describe.skip` so the suite stays green (unskip during implementation); artifact stages (`makeReq`/`makeTestPlan`) use `retryUntilGreen` + `requireArtifactStep` as `validationCommandFn`
- `retryUntilGreen`: kit wrapper over `getRecursiveSteps` — iteration 0 runs `steps`, retries run optional `fixSteps` resolver (`GetFirstStepsInput` → steps) or default fix prompt (formatted `prevValidateCommandDescriptor` + output); `validationCommandFn` required; barrel-exported; `abstractionBacklog` and `featureBacklog` use it; recursion returns next iteration steps from validation `postCommandExecFn` (not a trailing `StepFn` + run-state flag)
- `requireArtifactStep`: returns a `ValidationCommandFn` that exits 0 when the context-var path exists, else exits 1 with an error message (missing variable still throws)
- `findAbstraction` lump (`.lumpcode/lumps/findAbstraction/`): ephemeral contexts hunt duplicated CLI logic; each run adds one util under `packages/apps/cli/src/utils/<name>/` (`main.ts`, `index.ts`, `unit.test.ts`, barrel) and refactors call sites so net line count drops; writes `<utilName>.abstraction.md` in the lump dir; validates with `npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli`
- `backlogItems/` folder layout is for backlog-style recipes only (`backlog`, `featureBacklog`, `abstractionBacklog` / implementer lumps) — not every lump; future recipes may omit it
- `abstractionFinder` + `abstractionBacklog` (two-lump CLI-util pipeline): finder uses `ephemeralContextListFn` + prompt to append one implementer backlog item folder (`desc.yml` + `requirements.md`) per ephemeral context; finder does **not** own a `backlogItems/` tree — it writes into an explicit implementer `backlogItemsDir` (no `implementerLumpName` recipe default); implementer delegates to generic `backlog` with single `implementation` stage (items without `requirements.md` skipped); kit (`validateBaseBacklogItem`, `resolveBacklogPaths`, `folderBacklogContexts`, `folderSetTaskDoneStep`, `getRecursiveSteps`, `retryUntilGreen`, `requireArtifactStep`, `shellCommand`, `resolveImplValidateCommand`; deprecated `ymlBacklogContexts`/`setTaskDoneStep` warn once); `getRecursiveSteps` `ValidationCommandFn` is `MaybePromise<CommandDescriptor | null | undefined>`; `.lumpcode/lumps/abstractionFinder/` + `abstractionImplementer/` use abstraction recipes
- Abstraction backlog (`abstractionImplementer` `backlogItems/todo|completed/<name>/desc.yml`): items are `name`, `task`, `priority`, optional `dependsOn` only — **no `type` field**; requirements live at `backlogItems/todo/<name>/requirements.md`; finder ephemeral context names via ISO-8601 timestamp in `ephemeralContextListFn` default naming (`:` stripped for valid context names)
- Requirements authoring (`write-requirements` skill; committed project skills live in `.agents/skills/`, not `.cursor/skills/`): write to `.lumpcode/lumps/<lumpName>/backlogItems/todo/<kebab-name>/requirements.md`; specify contracts (signatures, schemas, config/data shapes, CLI syntax, JSON envelopes), not code snippets; requirements document must be a fully decided plan with **no "Open questions" section** — ask the user to resolve ambiguity before writing
- Agent skills: author **user-facing** (omit internal "assume the agent lacks the codebase/AGENTS.md" framing); commit project skills to `.agents/skills/<name>/SKILL.md` (Cursor scans `.agents/skills/`; prefer over personal `~/.cursor/skills/`; never `.cursor/skills/` or reserved `~/.cursor/skills-cursor/`); self-contained skills link to GitHub docs (`https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/...`); prefer directing users to `lumpcode lump-plan` for config validation over shipping bundled validator scripts; project `grilling` skill stress-tests plans one question at a time and drives toward precise interfaces (types, schemas) before implementation

### Cleanup

- `clean`: deletes lump branches (remote, local, shared copy) and worktrees under `.lumpcode/worktrees/`; `--lumpName` / `--contextName` (requires `--lumpName`) scope; v0.0.9 target: no pre-flight (today still uses `runProjectPreflight`)
