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

Top-level **`lumpVariables`** object from lump config, forwarded into every hook.

### `StepVariables`

```ts
type StepVariables = Record<string, unknown>;
```

Per–prompt-step bag from `stepVariables` on a prompt item.

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

### `GetContextListFn`

```ts
interface GetContextListFnInput {
  codeBasePaths: CodeBasePath[];
  lumpVariables: LumpVariables;
}

type GetContextListFn = (
  params: GetContextListFnInput,
) => MaybePromise<ContextList>;
```

### `ContextMatchFn`

Called once per scanned `CodeBasePath`. `codeBasePath` is the current entry; `codeBasePaths` is the full list for that run (same array reference on every call).

Every returned `contextName` must be unique in the final context list. Lumpcode enforces that by **merging** all matches that share a `contextName` into one `Context`: `variables` keys accumulate (same key from a later file overwrites), and `contextOptions` from a later match replace earlier ones. For one file per context, give each match a distinct `contextName` (path-based names are common—see [examples.md](./examples.md#3-test-coverage-sweep--add-a-test-next-to-every-untested-module)).

```ts
type ContextMatchFn = (params: {
  codeBasePath: CodeBasePath;
  codeBasePaths: CodeBasePath[];
  lumpVariables: Record<string, unknown>;
}) => MaybePromise<
  Maybe<{
    contextName: string;
    filePathVariableName: string;
    moreContextVariables?: Record<string, string>;
    contextOptions?: Context['options'];
  }>
>;
```

### `BranchFn`

```ts
type BranchFn = (params: {
  contextList: Context[];
  contextRunStateList: ContextRunState[];
  lumpVariables: LumpVariables;
}) => MaybePromise<string>;
```

Return the **git branch name** to use for this batch.

### `PromptFn`

```ts
interface PromptFnInput {
  context: Context;
  /** Root index or nested path for dynamic `steps` */
  stepIndex: number | number[];
  contextRunState: ContextRunState;
  lumpVariables: LumpVariables;
  stepVariables?: StepVariables;
}

type PromptFn = (params: PromptFnInput) => MaybePromise<string>;
```

### `CommandFn`

```ts
type CommandFn = ((
  params: {
    context: Context;
    prompt: string;
    stepIndex: number | number[];
    contextRunState: ContextRunState;
    lumpVariables: LumpVariables;
    stepVariables?: StepVariables;
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
type PostCommandExecFn = (input: {
  commandResult: string;
  commandSucceeded: boolean;
  context: Context;
  prompt: string;
  stepIndex: number | number[];
  contextRunState: ContextRunState;
  lumpVariables: LumpVariables;
  stepVariables?: StepVariables;
  projectRoot: string;
}) => MaybePromise<void>;
```

`commandResult` is the **captured stdout** (string). Parse JSON yourself if your agent returns structured text. `commandSucceeded` is `true` when the subprocess exited successfully or execution was skipped (`commandFn` returned `null`); `false` when the subprocess failed but `continueOnError` allowed the hook to run.

### `SetupFn`

```ts
type SetupFn = (params: {
  contextList: Context[];
  lumpVariables: LumpVariables;
  currentContextIndex: number;
}) => MaybePromise<
  Maybe<Partial<{ contextRunState: ContextRunState }>>
>;
```

### `TeardownFn`

```ts
type TeardownFn = (params: {
  lumpVariables: LumpVariables;
  contextList: Context[];
  contextRunState: ContextRunState;
  currentContextIndex: number;
}) => MaybePromise<void>;
```

### Workspace hooks

There is no user-facing `setupWorkspaceFn` / `teardownWorkspaceFn` in lump config any more — the CLI generates both from the resolved workspace (per [local-config.md](./local-config.md)'s `mode`) and the lump's `baseBranch`. See [advanced-config.md](./advanced-config.md#workspace-handling) for the rationale.

### Command module (`command` / `setup` / `teardown`)

Custom modules under `.lumpcode/commands/<name>.js` export:

```ts
export const command: CommandFn = …;
export const setup?: SetupFn;
export const teardown?: TeardownFn;
```

`setup` / `teardown` use the same parameter shapes as lump-level hooks.

---

## Related documentation

- [lump-config.md](./lump-config.md) — Where these types appear in JSON
- [advanced-config.md](./advanced-config.md) — Hooks, dynamic prompts, custom commands
- [concepts.md](./concepts.md) — Daemon, workspace, status lifecycle
