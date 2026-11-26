/**
 * Type-level contracts for dual-bag `<V, SV>` and lump-only `<V>` generics.
 * Source of truth: backlog typed-lump-and-step-variables testPlan §5.1–5.2.
 */
import { describe, it, expectTypeOf } from 'vitest';
import type {
  Agent,
  AgentResult,
  AgentSession,
  BranchFn,
  CommandFn,
  CommandOutputEvent,
  ContextResult,
  ExecuteStepsFailureData,
  GetContextListFn,
  GetContextListFnInput,
  GitAddCommitFn,
  GitCommitMessageFn,
  GitCommitMessageFnInput,
  GitPushFn,
  HistoryEntry,
  PostCommandExecFn,
  PromptFn,
  PromptOptions,
  SetupFn,
  Shell,
  ShellOptions,
  ShellResult,
  Step,
  Steps,
  TeardownFn,
  TeardownWorkspaceFn,
  WorkflowFn,
  WorkflowResult,
} from './index';
import type { RunLumpInput, runLump } from '../usages/runLump/main';
import type * as coreTypes from './index';

/** Refined lump bag */
type V = { model?: string; myHookFlag: boolean };

/** Refined step bag — intentionally different from V (proves independence) */
type SV = { model?: string; newChat?: boolean; stepOnly: number };

describe('core dual-bag <V, SV> (C1–C8)', () => {
  it('C1: PromptFn<V, SV> refines both bags', () => {
    const fn: PromptFn<V, SV> = (params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      expectTypeOf(params.stepVariables).toEqualTypeOf<SV | undefined>();
      return '';
    };
    void fn;
  });

  it('C2: CommandFn<V, SV> refines both bags', () => {
    const fn: CommandFn<V, SV> = (params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      expectTypeOf(params.stepVariables).toEqualTypeOf<SV | undefined>();
      return { executable: 'echo', args: [] };
    };
    void fn;
  });

  it('C3: PostCommandExecFn<V, SV> refines both bags', () => {
    const fn: PostCommandExecFn<V, SV> = (params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      expectTypeOf(params.stepVariables).toEqualTypeOf<SV | undefined>();
      expectTypeOf(params.signal).toEqualTypeOf<AbortSignal | undefined>();
    };
    void fn;
  });

  it('C4: Step / Steps carry SV and dual-bag hooks', () => {
    const step: Step<V, SV> = {
      stepVariables: { stepOnly: 1, newChat: true, model: 'auto' },
      promptFn: (params) => {
        expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
        expectTypeOf(params.stepVariables).toEqualTypeOf<SV | undefined>();
        return '';
      },
      commandFn: (params) => {
        expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
        expectTypeOf(params.stepVariables).toEqualTypeOf<SV | undefined>();
        return null;
      },
    };
    expectTypeOf(step.stepVariables).toEqualTypeOf<SV | undefined>();

    const steps: Steps<V, SV> = [step];
    expectTypeOf(steps).toEqualTypeOf<Steps<V, SV>>();
  });

  it('C5: RunLumpInput / runLump accept dual bags', () => {
    const input: RunLumpInput<V, SV> = {
      projectRoot: '/tmp',
      baseBranch: 'main',
      lumpVariables: { myHookFlag: true, model: 'auto' },
      branchFn: () => 'lump/x',
      getContextListFn: () => [],
      steps: [
        {
          stepVariables: { stepOnly: 2 },
        },
      ],
    };
    expectTypeOf(input.lumpVariables).toEqualTypeOf<V | undefined>();
    expectTypeOf(input.steps).toEqualTypeOf<Steps<V, SV> | undefined>();
    expectTypeOf<typeof runLump<V, SV>>().toBeFunction();
  });

  it('C6: HistoryEntry refines both bags', () => {
    type Entry = HistoryEntry<V, SV>;
    expectTypeOf<Entry['lumpVariables']>().toEqualTypeOf<V>();
    expectTypeOf<Entry['stepVariables']>().toEqualTypeOf<SV | undefined>();
  });

  it('C7: default type params keep untyped configs assignable', () => {
    const input: RunLumpInput = {
      projectRoot: '/tmp',
      baseBranch: 'main',
      lumpVariables: { anything: 1 },
      branchFn: () => 'b',
      getContextListFn: () => [],
      steps: [{ stepVariables: { alsoAnything: true } }],
    };
    expectTypeOf(input).toMatchTypeOf<RunLumpInput>();
  });

  it('C8: V and SV are independent (no SV extends V)', () => {
    type Independent = RunLumpInput<V, SV>;
    const ok: Independent = {
      projectRoot: '/tmp',
      baseBranch: 'main',
      lumpVariables: { myHookFlag: true },
      branchFn: () => 'b',
      getContextListFn: () => [],
      steps: [{ stepVariables: { stepOnly: 1, newChat: true } }],
    };
    void ok;
    // SV has keys absent from V and vice versa — must compile
    expectTypeOf<V>().not.toMatchTypeOf<SV>();
    expectTypeOf<SV>().not.toMatchTypeOf<V>();
  });
});

describe('core lump-only <V> (C9–C12)', () => {
  it('C9: BranchFn / SetupFn / TeardownFn expose lumpVariables: V only', () => {
    const branch: BranchFn<V> = (params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      return 'branch';
    };
    const setup: SetupFn<V> = (params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      return {};
    };
    const teardown: TeardownFn<V> = (params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
    };
    void branch;
    void setup;
    void teardown;
    // Must not require a second type parameter
    expectTypeOf<BranchFn<V>>().toBeFunction();
    // @ts-expect-error BranchFn is lump-only — no SV type parameter
    type _BranchNoSV = BranchFn<V, SV>;
  });

  it('C10: GetContextListFn / input refine lumpVariables', () => {
    type Input = GetContextListFnInput<V>;
    expectTypeOf<Input['lumpVariables']>().toEqualTypeOf<V>();
    const fn: GetContextListFn<V> = (params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      return [];
    };
    void fn;
  });

  it('C11: GitCommitMessageFn / input refine lumpVariables', () => {
    type Input = GitCommitMessageFnInput<V>;
    expectTypeOf<Input['lumpVariables']>().toEqualTypeOf<V>();
    const fn: GitCommitMessageFn<V> = (params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      return 'msg';
    };
    void fn;
  });

  it('C12: git add+commit / push fns stay unparameterized', () => {
    expectTypeOf<GitAddCommitFn>().toBeFunction();
    expectTypeOf<GitPushFn>().toBeFunction();
    // @ts-expect-error GitAddCommitFn must not accept type parameters
    type _NoAddCommitParam = GitAddCommitFn<V>;
    // @ts-expect-error GitPushFn must not accept type parameters
    type _NoPushParam = GitPushFn<V>;
  });
});

describe('dynamic-discovery-branch core type guards (G3t/G4t)', () => {
  it('G3t: core GetContextListFnInput has no discoveryBranch (dynamic-discovery-branch)', () => {
    type Input = GetContextListFnInput<V>;
    // @ts-expect-error discoveryBranch must not exist on core GetContextListFnInput
    type _NoDiscovery = Input['discoveryBranch'];
  });

  it('G4t: core RunLumpInput.baseBranch remains string (dynamic-discovery-branch)', () => {
    expectTypeOf<RunLumpInput['baseBranch']>().toEqualTypeOf<string>();
  });
});

describe.skip('workflow API types', () => {
  it('WorkflowFn infers lumpVariables and variables', () => {
    const workflowOnly: RunLumpInput<V, SV> = {
      projectRoot: '/tmp',
      baseBranch: 'main',
      branchFn: () => 'b',
      getContextListFn: () => [],
      workflow: async (input) => {
        expectTypeOf(input.lumpVariables).toEqualTypeOf<V>();
        expectTypeOf(input.signal).toEqualTypeOf<AbortSignal>();
        expectTypeOf(input.agent).toEqualTypeOf<Agent>();
        expectTypeOf(input.shell).toEqualTypeOf<Shell>();
        return { variables: { stepOnly: 1, newChat: true }, message: 'done' };
      },
    };
    expectTypeOf(workflowOnly.workflow).toEqualTypeOf<WorkflowFn<V, SV> | undefined>();
    expectTypeOf<NonNullable<RunLumpInput<V, SV>['createAgent']>>().toBeFunction();
    expectTypeOf<RunLumpInput<V, SV>['timeoutMillis']>().toEqualTypeOf<number | undefined>();
  });

  it('keeps the public Step keys and hides WorkflowStep', () => {
    expectTypeOf<keyof Step>().toEqualTypeOf<
      'promptFn' | 'commandFn' | 'stepVariables' | 'postCommandExecFn' | 'continueOnError' | 'timeoutMillis'
    >();
    // @ts-expect-error WorkflowStep stays internal to workflowToSteps
    type _WorkflowStep = coreTypes.WorkflowStep;
  });

  it('CommandFn and SetupFn gain optional sessionId', () => {
    const command: CommandFn<V, SV> = (params) => {
      expectTypeOf(params.sessionId).toEqualTypeOf<string | undefined>();
      return null;
    };
    const setup: SetupFn<V> = () => ({ sessionId: 'from-setup', contextRunState: {} });
    void command;
    void setup;
  });

  it('history, events, shell, and context results match the contract', () => {
    expectTypeOf<HistoryEntry<V, SV>['kind']>().toEqualTypeOf<
      'prompt' | 'command' | 'shell' | 'workflow' | undefined
    >();
    expectTypeOf<HistoryEntry<V, SV>['workflowResult']>().toEqualTypeOf<WorkflowResult<SV> | undefined>();
    expectTypeOf<CommandOutputEvent['kind']>().toEqualTypeOf<'start' | 'chunk' | 'end' | 'log' | 'workflowEnd'>();
    expectTypeOf<Extract<CommandOutputEvent, { kind: 'start' }>['callKind']>().toEqualTypeOf<
      'prompt' | 'shell' | undefined
    >();
    expectTypeOf<Extract<CommandOutputEvent, { kind: 'end' }>['exitCode']>().toEqualTypeOf<
      number | null | undefined
    >();
    expectTypeOf<ContextResult<SV>['outcome']>().toEqualTypeOf<'pushed' | 'notPushed' | 'failed' | 'aborted'>();
    expectTypeOf<ContextResult<SV>['result']['succeeded']>().toEqualTypeOf<boolean>();
    expectTypeOf<ContextResult<SV>['result']['variables']>().toEqualTypeOf<SV | undefined>();
    expectTypeOf<ExecuteStepsFailureData['contextResults']>().toEqualTypeOf<ContextResult[] | undefined>();
    type WorkspaceHookInput = Parameters<TeardownWorkspaceFn>[0];
    expectTypeOf<WorkspaceHookInput['contextResults']>().toEqualTypeOf<ContextResult[]>();

    const shell = null as unknown as Shell;
    const agent = null as unknown as Agent;
    const command = null as unknown as CommandFn;
    expectTypeOf(shell('echo ok')).toEqualTypeOf<Promise<ShellResult>>();
    expectTypeOf(shell({ executable: 'echo', args: ['ok'] })).toEqualTypeOf<Promise<ShellResult>>();
    expectTypeOf(agent.session()).toEqualTypeOf<Promise<AgentSession>>();
    expectTypeOf(agent.session(command, { model: 'auto' })).toEqualTypeOf<Promise<AgentSession>>();
    expectTypeOf(agent.session({ command, sessionId: 's' })).toEqualTypeOf<Promise<AgentSession>>();
    expectTypeOf(agent.prompt('hi')).toEqualTypeOf<Promise<AgentResult>>();

    // @ts-expect-error authors never pass a signal to shell
    type _ShellSignal = ShellOptions['signal'];
    // @ts-expect-error authors never pass a signal to a prompt
    type _PromptSignal = PromptOptions['signal'];
  });
});
