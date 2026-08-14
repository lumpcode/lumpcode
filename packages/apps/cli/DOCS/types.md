# Types for Lumpcode lump configuration

This reference lists the JSON shapes and **JavaScript / TypeScript function signatures** you use in `config.json`, `config.js`, or `config.ts`. Types are described in TypeScript notation for clarity.

Conventions:

- `Maybe<T>` means `T | null | undefined`
- `MaybePromise<T>` means `T | Promise<T>`
- Each function signature below is a [function reference](./lump-config.md#field-forms-conventions): in `config.js` or `config.ts` you may pass it inline, and in any config format you may pass a string path to a `.js` or `.ts` module whose **default export** matches the signature.

---

## JSON data shapes

### `Context`

```ts
interface Context {
  name: string;
  variables: Record<string, string>;
  options?: {
    priority?: number;
    dependsOnContexts?: string[];
  };
}
```

- `name` — unique id for the unit of work; drives default commit subject suffix. Must match `^[a-zA-Z0-9_-]+$` (letters, digits, `_`, `-` only).
- `variables` — string map substituted into `{VAR}` / `@{VAR}` in prompts.
- `options.priority` — lower runs sooner among eligible contexts.
- `options.dependsOnContexts` — contexts that must be **`finished`** (marker commit on `origin/<baseBranch>`) before this one runs. Each entry is either:
  - a **same-lump** context `name`, or
  - a **cross-lump** reference `<otherLumpName>/<contextName>` (the lump folder name under `.lumpcode/lumps/`, then `/`, then that lump’s context name).

  `branchPushed` does **not** satisfy a dependency — the upstream PR must be merged. Cross-lump refs are resolved via that lump’s marker subject (`LUMP: <otherLumpName> - <contextName>`). See [examples.md § Cross-lump dependency](./examples.md#7-cross-lump-dependency--run-after-another-lump-finishes).

### `ContextList`

```ts
type ContextList = Context[];
```

Return type of `getContextListFn`; built internally for `contextMatchFn` and `contextListJson` (with optional `contextOptionsFn`) merges.

### `ContextOptionsFn`

```ts
type ContextOptionsFn = (
  contextWithoutOptions: Omit<Context, 'options'>,
) => MaybePromise<Maybe<Context['options']>>;
```

- **Input** — a `Context` with `name` and `variables` only (no `options` field yet from the template expander).
- **Return** — `null` or `undefined` to leave `options` unset; otherwise an object merged into that context (same shape as `Context['options']`).

Runs only when **`contextListJson`** is the context source; ignored for `getContextListFn` and `contextMatchFn`.

### `CodeBasePath`

```ts
interface CodeBasePath {
  isDir: boolean;
  path: string;
}
```

Paths use `/` separators, relative to the project root. Passed to `getContextListFn` as `codeBasePaths`. `contextMatchFn` receives the current path as `codeBasePath` and the full scanned list as `codeBasePaths` on every call.

### `ContextRunState`

```ts
type ContextRunState = Record<string, unknown>;
```

Mutable bag shared across prompt items for one context execution. Seed from `setupFn`; read/write in `promptFn`, `postCommandExecFn`, and dynamic `steps` functions.

### `LumpVariables`

```ts
type LumpVariables = Record<string, unknown>;
```

Top-level **`lumpVariables`** object from lump config, forwarded into every hook. Authoring types and hooks are generic over `V extends LumpVariables` (default = this unbound bag) so you can refine keys at compile time via `defineConfig<V, SV>` from [`@lumpcode/cli-utils`](https://www.npmjs.com/package/@lumpcode/cli-utils).

### `StepVariables`

```ts
type StepVariables = Record<string, unknown>;
```

Per–prompt-step bag from `stepVariables` on a prompt item. Independent of `V`: hooks and config types take a second type param `SV extends StepVariables` (no `SV extends V`). Defaults keep untyped configs assignable.

### Typed variables (`V` / `SV`)

| Surface | Type params | Notes |
| ------- | ----------- | ----- |
| `PromptFn` / `PromptFnInput`, `CommandFn`, `PostCommandExecFn`, `Step`, `Steps`, `LumpJsConfig`, `LumpJsConfigStep` / `Steps` / `StepsItem`, `LumpJsonConfig`, `CommandModule` | `<V, SV>` | Both bags on leaf steps and both-bag hooks |
| `LumpJsConfigStepsFn` / `StepFn` | `<V, SV>` on return; **input is lump-bag only** (`Omit<PromptFnInput<V, SV>, 'stepVariables'>`) | Dynamic expanders are not leaf steps |
| `BranchFn`, `SetupFn`, `TeardownFn`, `GetContextListFn`, `GitCommitMessageFn`, `ContextMatchFn` | `<V>` | Lump bag only |
| Cursor / Copilot / Claude Code / OpenCode / Codex preset contracts | — | Closed option shapes exported from `@lumpcode/cli-utils`: `CursorPresetLumpVariables`, `CursorPresetStepVariables`, `CopilotPresetLumpVariables`, `CopilotPresetStepVariables`, `ClaudeCodePresetLumpVariables`, `ClaudeCodePresetStepVariables`, `OpenCodePresetLumpVariables`, `OpenCodePresetStepVariables`, `CodexPresetLumpVariables`, `CodexPresetStepVariables`, plus `PresetSessionStepVariables`, `CursorAgentPermissions`, `CopilotAgentPermissions`, `ClaudeCodeAgentPermissions`, `OpenCodeAgentPermissions`, `CodexAgentPermissions`. Extend with `& { myFlag: boolean }` — no open index signature. |
| `@lumpcode/recipes` factories (`featureBacklog`, `backlog`, …) and variable-carrying kit | `<V, SV>` (context-list kit `<V>` only) | Same dual generics as `defineConfig`; omit type args for default bags. See the [`@lumpcode/recipes` README](https://github.com/lumpcode/lumpcode/blob/main/packages/recipes/README.md). |

### `ContextStatus`

```ts
type ContextStatus = 'toDo' | 'branchPushed' | 'finished';
```

Semantics: [concepts.md#core-terms](./concepts.md#core-terms).

### `ContextStatusRecordItem`

```ts
interface ContextStatusRecordItem {
  status: ContextStatus;
  contextName: string;
  branchName: string;
  commitMessage: string;
}
```

### `ContextStatusRecord`

```ts
type ContextStatusRecord = Record<string, ContextStatusRecordItem>;
```

The on-disk JSON uses the same keys as `contextName`.

---

## Hook signatures

When these hooks run during `lumpcode run` / a daemon tick (shared vs dedicated): [advanced-config.md § Hook lifecycle](./advanced-config.md#hook-lifecycle).

### `GetContextListFn`

```ts
interface GetContextListFnInput<V extends LumpVariables = LumpVariables> {
  codeBasePaths: CodeBasePath[];
  lumpVariables: V;
}

type GetContextListFn<V extends LumpVariables = LumpVariables> = (
  params: GetContextListFnInput<V>,
) => MaybePromise<ContextList>;
```

### `ContextMatchFn`

Called once per scanned `CodeBasePath`. `codeBasePath` is the current entry; `codeBasePaths` is the full list for that run (same array reference on every call).

Every returned `contextName` must be unique in the final context list. Lumpcode enforces that by **merging** all matches that share a `contextName` into one `Context`: `variables` keys accumulate (same key from a later file overwrites), and `contextOptions` from a later match replace earlier ones. For one file per context, give each match a distinct `contextName` (path-based names are common—see [examples.md](./examples.md#3-test-coverage-sweep--add-a-test-next-to-every-untested-module)).

```ts
type ContextMatchFn<V extends LumpVariables = LumpVariables> = (params: {
  codeBasePath: CodeBasePath;
  codeBasePaths: CodeBasePath[];
  lumpVariables: V;
}) => MaybePromise<
  Maybe<{
    contextName: string;
    filePathVariableName: string;
    moreContextVariables?: Record<string, string>;
    contextOptions?: Context['options'];
  }>
>;
```

### `DisabledFn` (function form of `disabled`)

```ts
type DisabledFn = () => MaybePromise<boolean>;
```

Zero-argument function accepted by the top-level [`disabled`](./lump-config.md#optional-top-level-fields) field (inline in `config.js` / `config.ts`, or as the default export of a module referenced by file path). Evaluated on each run/tick; return `true` to skip the lump.

### `BranchFn`

```ts
type BranchFn<V extends LumpVariables = LumpVariables> = (params: {
  contextList: Context[];
  contextRunStateList: ContextRunState[];
  lumpVariables: V;
}) => MaybePromise<string>;
```

Return the **git branch name** to use for this batch.

### `PromptFn`

```ts
interface PromptFnInput<
  V extends LumpVariables = LumpVariables,
  SV extends StepVariables = StepVariables,
> {
  context: Context;
  /** Root index or nested path for dynamic `steps` */
  stepIndex: number | number[];
  contextRunState: ContextRunState;
  lumpVariables: V;
  stepVariables?: SV;
}

type PromptFn<
  V extends LumpVariables = LumpVariables,
  SV extends StepVariables = StepVariables,
> = (params: PromptFnInput<V, SV>) => MaybePromise<string>;
```

### `CommandFn`

```ts
type CommandFn<
  V extends LumpVariables = LumpVariables,
  SV extends StepVariables = StepVariables,
> = ((
  params: {
    context: Context;
    prompt: string;
    stepIndex: number | number[];
    contextRunState: ContextRunState;
    lumpVariables: V;
    stepVariables?: SV;
    projectRoot: string;
    workspacePath: string;
  },
) => MaybePromise<{ executable: string; args: string[]; env?: Record<string, string> } | null | undefined | void>) & {
  /** Set automatically when Lumpcode resolves a named command module */
  commandName?: string;
};
```

Return `{ executable, args }` to run a subprocess. Optionally include `env` (`Record<string, string>`) to set or override environment variables for that command; values are merged over the parent process environment. Return `null`, `undefined`, or nothing to skip execution; `postCommandExecFn` still runs with an empty `commandResult`. `keepHistory` entries are not written for skipped commands.

Lumpcode runs the agent as `executable` + `args`. Agent-specific flags and the prompt text go into `args` the way your agent expects (e.g. `executable: 'copilot', args: ['-p', prompt]` or `executable: 'aider', args: ['--message', prompt]`). This is exactly what a command module at `.lumpcode/commands/<name>.js` exports as its `command`.

### `PostCommandExecFn`

```ts
type PostCommandExecFn<
  V extends LumpVariables = LumpVariables,
  SV extends StepVariables = StepVariables,
> = (input: {
  commandResult: string;
  commandSucceeded: boolean;
  context: Context;
  prompt: string;
  stepIndex: number | number[];
  contextRunState: ContextRunState;
  lumpVariables: V;
  stepVariables?: SV;
  projectRoot: string;
}) => MaybePromise<void | Steps<V, SV>>;
```

`commandResult` is the **captured stdout** (string). Parse JSON yourself if your agent returns structured text. `commandSucceeded` is `true` when the subprocess exited successfully or execution was skipped (`commandFn` returned `null`); `false` when the subprocess failed but the step's [`continueOnError`](./lump-config.md#per-item-fields-lumpjsonconfigstep) allowed the hook to run.

Return `void` / `undefined` / `[]` for a no-op. Return a `Steps` array to run follow-on steps nested under this leaf (same `stepIndex` path rules as a dynamic `StepFn` child). In JS/TS configs the CLI also accepts a solo steps item and normalizes it to an array before the engine runs. Steps returned here are **runtime-only** — `lump-plan` does not expand them.

### `SetupFn`

```ts
type SetupFn<V extends LumpVariables = LumpVariables> = (params: {
  contextList: Context[];
  lumpVariables: V;
  currentContextIndex: number;
}) => MaybePromise<
  Maybe<Partial<{ contextRunState: ContextRunState }>>
>;
```

### `TeardownFn`

```ts
type TeardownFn<V extends LumpVariables = LumpVariables> = (params: {
  lumpVariables: V;
  contextList: Context[];
  contextRunState: ContextRunState;
  currentContextIndex: number;
}) => MaybePromise<void>;
```

### Workspace hooks

There is no user-facing `setupWorkspaceFn` / `teardownWorkspaceFn` in lump config any more — the CLI generates both from the resolved workspace (per [local-config.md](./local-config.md)'s `mode`) and the lump's `baseBranch`. See [advanced-config.md](./advanced-config.md#workspace-handling) for the rationale.

### Command module (`command` / `setup` / `teardown`)

Custom modules under `.lumpcode/commands/<name>.js` export a `CommandModule<V, SV>`:

```ts
export const command: CommandFn<V, SV> = …;
export const setup?: SetupFn<V>;
export const teardown?: TeardownFn<V>;
```

`setup` / `teardown` are lump-bag only (`<V>`); `command` carries both bags. Use `defineCommandModule` / `defineCommand` / `defineCommandSetup` / `defineCommandTeardown` from `@lumpcode/cli-utils` (or soft-aligned `@lumpcode/cli-types`) so refined `V` / `SV` are not erased.

---

## Related documentation

- [lump-config.md](./lump-config.md) — Where these types appear in JSON
- [advanced-config.md](./advanced-config.md#hook-lifecycle) — Lifecycle schemas (shared / dedicated), dynamic prompts, custom commands
- [concepts.md](./concepts.md) — Daemon, workspace, status lifecycle
