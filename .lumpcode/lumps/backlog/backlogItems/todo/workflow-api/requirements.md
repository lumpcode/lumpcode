# Requirements: Workflow API (umbrella)

| Field | Value |
| --- | --- |
| **Backlog** | `workflow-api` · priority **11** · umbrella |
| **Roadmap** | `.lumpcode/lumps/backlog/last-20-percent-requirements.md` |
| **Decided** | 2026-11-25/26, grilled |
| **Packages** | `@lumpcode/core` (engine, public types), `@lumpcode/cli` (agent implementation, presets, config, `lump-plan`, transcripts), `@lumpcode/cli-utils` / `cli-types` (re-exported types), `@lumpcode/recipes` (kit, recipes, `openPrPostTeardown`) |

This file is the **canonical contract** for the five tickets. A ticket's `requirements.md` says which part it delivers and how; it does not restate these types.

## Problem statement and motivation

A lump config today is half declarative JSON and half functions. To loop, an author returns steps from steps (`getValidationLoopSteps`), keeps state in `stepVariables`, picks an agent chat with `newChat` / `chatIdIndex` step-index keys, and holds back a push by adding a fake `exit 1` step (`withholdPushAfterValidationFailure`). It works, but it is a small interpreter with its own language, and newcomers do not read it at first glance.

Lumpcode accepts being a library first and a CLI second. A lump declares `workflow`: one async function, which is the context's single step, written in plain TypeScript. Steps stay as the second, declarative API (as the Options API beside the Composition API).

**Everything you can code with your agent can become a factory.**

```ts
export default defineLump({
  getContextListFn,                          // unchanged
  postSetupWorkspaceFn,                      // every hook unchanged
  async workflow({ context, agent, shell }) {
    const session = await agent.session();   // the template's command
    await session.prompt(`Implement ${context.name}`);
    const green = await retryUntilGreen({ session, shell, check: 'npm run test', maxAttempts: 3 });
    const review = await agent.session('cursor', { model: 'auto' });
    await review.prompt('Review the diff and fix what is wrong');
    return {
      succeeded: green.succeeded,
      message: green.succeeded ? 'Implemented, tests green.' : 'Tests still red after 3 attempts.',
      variables: { implSessionId: session.sessionId },
    };
  },
});
```

## Goals

1. A lump's work is one readable function: sessions, shell calls, loops, conditions, parallel calls.
2. Changing agent (preset or custom command) is one argument: `agent.session('cursor')`.
3. The function decides the outcome (`succeeded`, `push`, `message`) without fake steps.
4. Transcripts, history, timeouts and abort work for every inner call as they do for steps.
5. Recipes and the kit are workflow first, with the plain names; steps versions keep working under `…Steps` names.
6. Steps lumps and custom presets behave exactly as today.

## Non-goals

- Rebuilding the step walk on top of workflow (a steps-on-workflow adapter). Workflow is converted to steps, not the reverse.
- Mixing `steps` and `workflow` in one lump.
- Resuming a workflow in the middle. A context reruns from the top, as steps do today.
- Session renaming in presets.
- A structured JSONL transcript (`history-and-transcripts` owns the history format).
- Workflow in JSON configs.

## Key decisions

| # | Decision |
| --- | --- |
| 1 | Helpers are **passed in** (`agent`, `shell`, `log`, `signal` in `WorkflowInput`), not imported. Core owns the `Agent` and `Shell` interfaces; the CLI implements `Agent` with command modules. |
| 2 | `agent.session()` is async, has two call signatures, and always returns a real `sessionId`. Without `sessionId` it creates a new session. |
| 3 | A session belongs to the **command** that created it (preset tag or custom `CommandFn`). Reusing it with another command fails. |
| 4 | Command modules gain three optional things: a `createSession` export, a `sessionId` field in the `CommandFn` input, a `sessionId` field in the `SetupFn` output. Without `createSession`, the runtime makes a UUID. |
| 5 | `shell` runs on the step executor. A failure returns a result; only a workflow stop throws `AbortError`. |
| 6 | The workflow returns `succeeded`, `push`, `message`, `variables`. `variables` are stored as the single step's `stepVariables`. |
| 7 | `workflowToSteps` converts the workflow into one **internal** step variant. The public `Step` type is unchanged. |
| 8 | `timeoutMillis` limits the whole workflow (it is one step). Default **2 hours** for a workflow; steps keep 30 minutes. Per-call `timeoutMillis` options return `timedOut: true`. |
| 9 | The runtime binds `agent` and `shell` to the workflow's abort signal; authors never pass a signal. |
| 10 | Parallel calls are allowed. One prompt at a time per session. Output is buffered per call. The shared workspace is the author's concern. |
| 11 | Same transcript files and output events, with labels, plus `log` and `workflowEnd` events. |
| 12 | Every context (steps or workflow) has a `ContextResult`. The teardown hook receives `contextResults`; `openPrPostTeardown` uses the messages and opens drafts on failure. |
| 13 | Naming: the workflow version takes the plain name; the steps version takes the `Steps` / `Step` suffix. Breaking, with no aliases for recipes or kit. |
| 14 | `desc.yml` field `stages` replaces `workflow` (deprecated alias). Context variable `STAGES` replaces `WORKFLOW` (still set). |

## Interfaces

### Core: workflow (`@lumpcode/core`, re-exported by `cli-utils`)

```ts
export interface WorkflowInput<V extends LumpVariables = LumpVariables> {
  context: Context;
  lumpVariables: V;
  contextRunState: ContextRunState;
  projectRoot: string;
  workspacePath: string;
  /** Read-only. For the author's own async work (fetch, own child processes). Never passed to agent or shell. */
  signal: AbortSignal;
  agent: Agent;
  shell: Shell;
  /** Written to the run log and the transcript (`log` event). */
  log: (message: string) => void;
}

export interface WorkflowResult<SV extends StepVariables = StepVariables> {
  /** Default true. false: pushed (unless push: false) but marked failing; openPr opens a draft. */
  succeeded?: boolean;
  /** Default true. false: no commit, no push, context stays toDo, run reported failed. */
  push?: boolean;
  /** Shown in the run output, the dashboard, and the default PR body. */
  message?: string;
  /** Stored as the workflow step's stepVariables (history). */
  variables?: SV;
}

export type WorkflowFn<V extends LumpVariables = LumpVariables, SV extends StepVariables = StepVariables> =
  (input: WorkflowInput<V>) => Promise<WorkflowResult<SV> | void>;

// RunLumpInput: NEW `workflow?: WorkflowFn<V, SV>`; setting it together with `steps` is a failure.
```

### Core: agent

```ts
/** A preset tag ('claude-code', 'cursor', a custom preset), or a raw command function. */
export type AgentCommand = string | CommandFn;

/** Preset-specific (permissionMode, allowedTools, disallowedTools, bare, …), as `agentPermissions` today. */
export type AgentPermissions = Record<string, unknown>;

export interface PromptOptions {
  model?: string;                 // overrides lumpVariables.model
  permissions?: AgentPermissions; // overrides lumpVariables.agentPermissions
  extraArgs?: string[];           // overrides lumpVariables.extraArgs
  timeoutMillis?: number;         // this call only; omitted: the rest of the workflow's time
  label?: string;                 // logs, history, transcript; default: first prompt line, 60 chars
}

export interface SessionOptions extends PromptOptions {
  /** The agent's real session id, e.g. `otherSession.sessionId`. Omitted: a new session. */
  sessionId?: string;
}

export interface Agent {
  /** Default command (the lump's `command`). */
  session(options?: SessionOptions & { command?: AgentCommand }): Promise<AgentSession>;
  /** Explicit command. */
  session(command: AgentCommand, options?: SessionOptions): Promise<AgentSession>;
  /** The default command's default session: the one `setup` returned, else one created on first use. */
  prompt(text: string, options?: PromptOptions): Promise<AgentResult>;
}

export interface AgentSession {
  readonly command: string;       // preset tag, or the CommandFn's commandName
  readonly sessionId: string;     // always set
  /** Options layer: lump → session → this call. */
  prompt(text: string, options?: PromptOptions): Promise<AgentResult>;
}

export interface AgentResult {
  output: string;
  succeeded: boolean;
  exitCode: number | null;
  timedOut: boolean;
}
```

`session()` argument rule: a `string` or `function` first argument is the command and the second is `SessionOptions`; an object or nothing is the options (with an optional `command`). A command given both ways fails: `Pass the command once: as the first argument or as options.command.`

Errors:

| Case | Message |
| --- | --- |
| `sessionId` created in this run by another command | `Session <id> belongs to command <a>, not <b>.` |
| A second `prompt()` on a session while one runs | `Session <id> is already running a prompt.` |
| Unknown `sessionId` (not created in this run) | no error: passed through, so a session from an earlier run can be resumed |

### Core: shell

```ts
export interface Shell {
  (command: string | CommandDescriptor, options?: ShellOptions): Promise<ShellResult>;
}
export interface ShellOptions {
  cwd?: string;                   // default: workspacePath
  env?: Record<string, string>;   // merged over process.env
  timeoutMillis?: number;         // this call only
  label?: string;                 // default: the command text
}
export interface ShellResult {
  output: string;                 // stdout and stderr together, as commandResult today
  succeeded: boolean;             // exit 0, no timeout
  exitCode: number | null;        // null on timeout or signal
  timedOut: boolean;
}
```

A string runs as `sh -c <string>`; a `CommandDescriptor` runs directly.

### Core: results, steps conversion, history, events

```ts
export type ContextResultOutcome = 'pushed' | 'notPushed' | 'failed' | 'aborted';

export interface ContextResult<SV extends StepVariables = StepVariables> {
  context: Context;
  outcome: ContextResultOutcome;
  /** Normalized: void or a steps lump → { succeeded: true, push: true }; a throw → { succeeded: false, push: false, message }. */
  result: Required<Pick<WorkflowResult<SV>, 'succeeded' | 'push'>> & Pick<WorkflowResult<SV>, 'message' | 'variables'>;
}

// internal, not exported
type WorkflowStep<V, SV> = { kind: 'workflow'; workflowFn: WorkflowFn<V, SV>; timeoutMillis?: number };
type InternalStep<V, SV> = Step<V, SV> | WorkflowStep<V, SV>;
function workflowToSteps<V, SV>(workflow: WorkflowFn<V, SV>, timeoutMillis?: number): InternalStep<V, SV>[];

// ExecuteStepsFailureReason: + 'workflowNotPushed' | 'workflowThrew'

// HistoryEntry: NEW optional fields
//   kind?: 'prompt' | 'command' | 'shell' | 'workflow'   (absent = a classic step)
//   label?: string; command?: string; sessionId?: string; workflowResult?: WorkflowResult<SV>
//   stepIndex: workflow step [0]; inner calls [0, n] (n = call start order)

// CommandOutputEvent: CHANGED
//   'start' + callKind?: 'prompt' | 'shell'; label?: string; sessionId?: string
//   'end'   + exitCode?: number | null; timedOut?: boolean
//   NEW { kind: 'log'; contextName: string; message: string }
//   NEW { kind: 'workflowEnd'; contextName: string; result: ContextResult['result'] }
```

| Workflow ends with | `outcome` | Commit and push | Context | `openPrPostTeardown` |
| --- | --- | --- | --- | --- |
| `void` / `{}` | `pushed` | yes | `branchPushed` | normal PR |
| `{ succeeded: false, message }` | `pushed` | yes | `branchPushed` | draft PR, message in body |
| `{ push: false, message }` | `notPushed` | no | `toDo` | none |
| throws | `failed` | no | `toDo` | none |
| timeout, Ctrl-C, daemon stop, watchdog | `aborted` | no | `toDo` | none |

### Time limits and abort

| What fires | Effect | What the workflow sees |
| --- | --- | --- |
| A call's own `timeoutMillis` | that call's process tree is killed | `{ succeeded: false, timedOut: true }`, no throw |
| The workflow's `timeoutMillis` (default 2 h) | all calls in flight killed | the current `await` throws `AbortError`, later calls throw at once |
| Ctrl-C, daemon stop, watchdog | same | same |

### CLI: command modules (`packages/apps/cli/src/types/CommandModule.ts`)

```ts
interface CommandModule<V, SV> {
  command: CommandFn<V, SV>;
  setup?: SetupFn<V>;
  teardown?: TeardownFn<V>;
  presentOutput?: PresentOutputFnFactory<V, SV>;
  /** NEW, optional. Creates a new agent session and returns its id. */
  createSession?: (input: { lumpVariables: V; model?: string; workspacePath: string }) => Promise<string>;
}
// core CommandFn input: NEW `sessionId?: string` (set by workflows; absent for steps)
// core SetupFn output: NEW `sessionId?: string` (the session setup created; the default session for agent.prompt())
```

| Call | Runtime |
| --- | --- |
| First use of a command in a context | load the module, run `setup`; its `sessionId` becomes that command's default session |
| `session(cmd)` | `createSession`, else a UUID; record `sessionId → cmd` |
| `prompt` | `command({ prompt, sessionId, stepVariables: { model, agentPermissions, extraArgs }, … })` through the executor; output through `presentOutput` |
| End of the context | `teardown` for every command used |

### CLI: config and hooks

```ts
// LumpJsConfig: NEW
workflow?: FilePath | WorkflowFn<V, SV>;     // not with `steps` or `prompt`
// timeoutMillis: unchanged field; for a workflow it limits the whole workflow (default 2 h)

// PostSetupWorkspaceFnInput: NEW
contextResults: ContextResult[];             // teardown: one per context run on this branch, in run order; setup: []
```

| Check | Result |
| --- | --- |
| `workflow` with `steps` or `prompt` | invalid: `Use workflow or steps/prompt, not both.` |
| `workflow` in a JSON config | invalid: `workflow needs a TypeScript or JavaScript config.` |
| `workflow` not a function after loading | invalid: `workflow must be a function (got <type>).` |
| `workflow` with `registerCommands` | warning: `registerCommands is not needed with workflow; presets load on first use.` |
| `lump-plan` summary | `run: workflow` instead of the step count |

### Recipes and kit (`@lumpcode/recipes`)

| Workflow (plain name) | Steps (suffix) |
| --- | --- |
| `retryUntilGreen({ session, shell, check, prompt?, maxAttempts = 3, fixPrompt? })` | `retryUntilGreenSteps` (today's `retryUntilGreen`) |
| `requireArtifact({ session, workspacePath, path, prompt?, maxAttempts = 2 })` | `requireArtifactStep` |
| `mustSucceed(result, message?)` | — |
| `featureBacklog`, `backlog`, `abstractionFinder`, `abstractionBacklog` | `featureBacklogSteps`, `backlogSteps`, `abstractionFinderSteps`, `abstractionBacklogSteps` |
| (with the recipes) `setTaskDone` | `setTaskDoneStep`, `folderSetTaskDoneStep` |

```ts
export function retryUntilGreen(input: {
  session: AgentSession;
  shell: Shell;
  check: string | CommandDescriptor;
  prompt?: string;                                       // first prompt; omit when the work already happened
  maxAttempts?: number;                                  // fix attempts after the first check, default 3
  fixPrompt?: (failed: ShellResult, attempt: number) => string;
}): Promise<{ succeeded: boolean; attempts: number; lastCheck: ShellResult }>;

export function requireArtifact(input: {
  session: AgentSession;
  workspacePath: string;
  path: string;
  prompt?: string;                                       // default: "Write <path>. It is missing."
  maxAttempts?: number;                                  // default 2
}): Promise<{ succeeded: boolean; path: string }>;

export function mustSucceed<R extends ShellResult | AgentResult>(result: R, message?: string): R;

// openPrPostTeardown: NEW option draftOnFailure?: boolean (default true); title/body input has contextResults
// default body: "### <context name>\n<message>" per pushed context with a message, else "LUMP contexts: <names>"
```

## Tickets

| Priority | Ticket | Delivers | Requirements |
| --- | --- | --- | --- |
| 11 | `core` | Workflow, agent and shell interfaces, `workflowToSteps`, shell executor, abort and timeout binding, parallel calls, `ContextResult`, history and events | `tickets/core/requirements.md` |
| 12 | `agent-sessions` | CLI `Agent` over command modules, preset changes | `tickets/agent-sessions/requirements.md` |
| 13 | `config-and-plan` | `workflow` config field, checks, `lump-plan`, 2 h default, transcript headers, `contextResults` in hooks | `tickets/config-and-plan/requirements.md` |
| 14 | `kit` | Workflow kit, `retryUntilGreenSteps`, PR body and drafts | `tickets/kit/requirements.md` |
| 15 | `recipes` | Workflow recipes, `…Steps` recipes, `stages`, this repo's lumps | `tickets/recipes/requirements.md` |

Then: `repo-lumps-workflow` (16, this repo's lumps as workflows), `workflow-first-docs-and-website` (17, docs and website, in the backlog lump), and `release-0-11-0` (18, breaking release). Everything else depends on `release-0-11-0`.

## Acceptance criteria

- The example at the top of this file runs as written in a fixture repo, pushes a branch, and its transcript shows each inner call with its label.
- `agent.session('cursor')` and `agent.session()` in one workflow use two presets with no `registerCommands`.
- A steps lump's history, transcript, commit and push are byte-for-byte what they are before this umbrella (except the new optional fields).
- `featureBacklogSteps` with today's options produces the same steps as today's `featureBacklog`.
- This repo's `backlog`, `qol`, `bugfixes` and `docs` lumps pass `lump-plan` on the workflow recipes.
