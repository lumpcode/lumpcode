# CLI framework

Commander wiring, logging, `--json` envelopes, and the lump config types the CLI exposes.

- Global options (`--json`, `--verbose`) on root program; subcommands read via `command.parent.opts()`; `lump-status` uses `--silent` for summary-only output
- `cliLog`: result envelope only; `--json` → one compact JSON line per invocation. Do not also `note()`/`console.log` a line returned on the command result — `cliLog` reprints the envelope and the line appears twice
- `addCommand`: injectable `exit(1)` on handler `Failure` and Zod parse failure
- Logger: `error` always prints (even with `--json`); `--json` suppresses other operational lines; CLI `--verbose` OR-merges lump-config `verbose`; `createCliLogger` prefixes `[lumpcode]`
- Shell escaping: `shellSingleQuote` from `@lumpcode/core` for user-controlled values; `shellBestEffort` for best-effort fragments
- Lump config has **no** raw `setupWorkspaceFn` / `teardownWorkspaceFn` knobs — CLI generates those from `local.json` + per-lump `baseBranch`. Optional `postSetupWorkspaceFn` / `postSetupWorkspaceCommand` (and teardown twins) run after generated setup / before generated teardown in the branch workspace; `lump-plan` skips them; not under `gitCommonDirLock` (do not put git mutations there)
- `LumpJsConfig` and related step/config types are dual-generic `<V extends LumpVariables = LumpVariables, SV extends StepVariables = StepVariables>`; authors refine with explicit type args at `defineConfig`/call sites (TS rarely infers from `lumpVariables`/`stepVariables` bags); defaults keep untyped configs working
- `LumpJsConfigSteps` is always an array of `LumpJsConfigStepsItem` (step object | `StepFn`/`LumpJsConfigStepsFn` | `promptTemplate` — no bare `promptFn`; those only via `prompt` or a step object); config `steps?: LumpJsConfigSteps | LumpJsConfigStepsItem` allows a solo item in JS/TS; private `prompt` solo type stays step | template | `promptFn`; `StepFn` exported via `cli-types`/`cli-utils`, input `Omit<PromptFnInput, 'stepVariables'>`, may return array or solo item; `normalizeSteps` always returns an array (solo fn → `[fn]`; other solos promote via the `prompt` wrap path; solo `steps` wins over `prompt`); JSON schema still requires an array
