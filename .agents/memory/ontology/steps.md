# Steps

What runs on each context. `steps` is a recursive list: a step object (`Step` in `packages/core/src/types/Step.ts`), a function that returns more steps (`StepFn`), or a prompt template. A step has an optional prompt (`promptTemplate` or `promptFn`), a command (agent tag, module path, or inline `commandFn`), and an optional `postCommandExecFn` that may return the next steps. A step without a prompt runs a plain command, which is how validation and retry loops are built.

`contextRunState` (`packages/core/src/types/ContextRunState.ts`) is one mutable object shared by every step of one context. CLI step types: `LumpJsConfigStep` / `LumpJsConfigSteps` in `packages/apps/cli/src/types/`. Execution order and failures: `domain/engine-lifecycle.md`.
