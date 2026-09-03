---
title: Types
description: Hook and config shapes for config.ts. Inline in JS/TS, or a file whose default export matches.
---

`Maybe<T>` is `T | null | undefined`. `MaybePromise<T>` is `T | Promise<T>`. Paths in `*Fn` fields are relative to the lump folder. Prefer `defineConfig` from `@lumpcode/cli-utils`. Refine bags with `defineConfig<V, SV>`.

## Data

```ts context.ts
interface Context {
  name: string // ^[a-zA-Z0-9_-]+$, unique, no /
  variables: Record<string, string>
  options?: { priority?: number; dependsOnContexts?: string[] }
}

interface CodeBasePath {
  isDir: boolean
  path: string // / separators, project-relative
}

type ContextRunState = Record<string, unknown>
type ContextStatus = 'toDo' | 'branchPushed' | 'finished'

interface ContextStatusRecordItem {
  status: ContextStatus
  contextName: string
  branchName: string
  commitMessage: string
}
```

`dependsOnContexts`: same-lump `name`, or `otherLump/contextName`. Must be **finished**.

## Discovery

```ts discovery.ts
type GetContextListFn<V = LumpVariables> = (params: {
  codeBasePaths: CodeBasePath[]
  lumpVariables: V
  discoveryBranch: string
}) => MaybePromise<Context[]>

type ContextMatchFn<V = LumpVariables> = (params: {
  codeBasePath: CodeBasePath
  codeBasePaths: CodeBasePath[]
  lumpVariables: V
}) => MaybePromise<Maybe<{
  contextName: string
  filePathVariableName: string
  moreContextVariables?: Record<string, string>
  contextOptions?: Context['options']
}>>

type ContextOptionsFn = (
  contextWithoutOptions: Omit<Context, 'options'>,
) => MaybePromise<Maybe<Context['options']>>
```

`contextMatchFn`: same `contextName` **merges**. `contextOptionsFn` only with `contextListJson`.

## Command and prompt

```ts command.ts
type PromptFn<V = LumpVariables, SV = StepVariables> = (params: {
  context: Context
  stepIndex: number | number[]
  contextRunState: ContextRunState
  lumpVariables: V
  stepVariables?: SV
}) => MaybePromise<string>

type CommandFn<V = LumpVariables, SV = StepVariables> = (params: {
  context: Context
  prompt: string
  stepIndex: number | number[]
  contextRunState: ContextRunState
  lumpVariables: V
  stepVariables?: SV
  projectRoot: string
  workspacePath: string
}) => MaybePromise<{ executable: string; args: string[]; env?: Record<string, string> } | null | undefined | void>

type PostCommandExecFn<V = LumpVariables, SV = StepVariables> = (input: {
  commandResult: string
  commandSucceeded: boolean
  context: Context
  prompt: string
  stepIndex: number | number[]
  contextRunState: ContextRunState
  lumpVariables: V
  stepVariables?: SV
  projectRoot: string
}) => MaybePromise<void | Steps<V, SV>>
```

`command` on a step or lump may be a tag, a lump-relative `.ts`/`.js` path, or this `CommandFn` inline (JS/TS). Return `{ executable, args }` to run; `null` / `undefined` / nothing to **skip** (no process). `postCommandExecFn` still runs with an empty `commandResult` and `commandSucceeded: true`. `keepHistory` is not written for a skip.

`promptFn` is not scanned for `{VAR}`. Nested dynamic steps get `stepIndex` as an array (`[1, 0]`). Steps returned from `postCommandExecFn` are runtime-only (`lump-plan` does not expand them).

## Lifecycle

```ts lifecycle.ts
type DisabledFn = () => MaybePromise<boolean>

type BranchFn<V = LumpVariables> = (params: {
  contextList: Context[]
  contextRunStateList: ContextRunState[]
  lumpVariables: V
}) => MaybePromise<string>

type SetupFn<V = LumpVariables> = (params: {
  contextList: Context[]
  lumpVariables: V
  currentContextIndex: number
}) => MaybePromise<Maybe<Partial<{ contextRunState: ContextRunState }>>>

type TeardownFn<V = LumpVariables> = (params: {
  lumpVariables: V
  contextList: Context[]
  contextRunState: ContextRunState
  currentContextIndex: number
}) => MaybePromise<void>

type PostSetupWorkspaceFn<V = LumpVariables> = (input: {
  baseBranch: string
  branchName: string
  contextList: Context[]
  workspacePath: string
  executionWorkspacePath: string
  workspaceStrategy: 'checkout' | 'worktree'
  projectRoot: string
  lumpVariables: V
}) => MaybePromise<{ command?: string } | void>
```

`PostTeardownWorkspaceFn` takes the same input. `command` is a shell fragment in `workspacePath`. Empty / omitted means no extra command. No `setupWorkspaceFn` / `teardownWorkspaceFn` / `gitCommitMessageFn` in lump config.

## Command module

```ts module.ts
export const command: CommandFn
export const setup?: SetupFn
export const teardown?: TeardownFn
```

`defineCommand` / `defineCommandSetup` / `defineCommandTeardown` / `defineCommandModule` from `@lumpcode/cli-utils`. When hooks run: [advanced](/docs/config/advanced). Preset option bags: [agents](/docs/author/agents).
