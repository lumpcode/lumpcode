# Code style

How code is written in this repo: function shape, results, scope, and where helpers live.

- Type functions with a direct `function` declaration or arrow functions; avoid `<Type>function` casts and the `const name = function name(...)` pattern
- Prefer a single destructured object argument for functions with 3+ parameters
- One type per file in `packages/core/src/types/`; types defined independently from default implementations
- Return `Success<T>` / `Failure<string>` for expected failures (`success()` / `failure()` from `@lumpcode/core`); resolve costly dynamic `import()` eagerly at configuration time, not during execution
- Use `cwd` with `execAsync`/`child_process` instead of `cd ... &&`; command functions return only the command string, pass `cwd` at the call site
- Limit change scope to specified packages; note follow-up work for other packages separately
- `@lumpcode/recipes` kit: reuse `@lumpcode/core` and exported `@lumpcode/cli-utils` helpers (`normalizeSteps`, `readYamlList`, …); lift CLI-only shared utils into `cli-utils` rather than duplicating in recipes — async-only when sync wrappers add no call-site value; recipe step types use CLI `LumpJsConfigSteps`, not core `Steps`; multi-file kit utils live under `src/kit/<name>/{main.ts,index.ts,unit.test.ts}` (single-file `src/kit/<name>.ts` OK for small helpers); barrel-export from `kit/index.ts`; do not invest in sharing implementations with deprecated `ymlBacklogContexts`/`setTaskDoneStep`
- CLI utils live flat under `packages/apps/cli/src/utils/` (one directory = one **concern**, not one function: `main.ts` + `index.ts`, barrel-exported from `utils/index.ts` — no nested subdirs; a module may export a cluster of related types/helpers, e.g. `daemonConfigFile`, `startDaemonDesired`). Shared test-only helpers go under `packages/apps/cli/src/testing/` with a barrel `index.ts`. Prefer a private inline helper in the calling module over a new util directory for small single-caller logic. Command modules must not import other command `main` modules (tests may import commands as fixtures); two-caller command logic belongs in a util with an explicit `Success`/`Failure` type, not `ReturnType<CommandHandlerMaker<…>>`
- Name path-lock release callbacks `releaseLock`, not phase-specific names (e.g. `phase1Lock`); enforce each guard/skip at one canonical layer — do not duplicate the same check in both `runLumpFromLumpName` and `runLumpFromJsConfig`
