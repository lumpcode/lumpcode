/**
 * define* helpers from @lumpcode/cli-utils (canonical consumer home) — D1–D10.
 */
import { describe, it, expectTypeOf } from 'vitest';
import type {
  BranchFn,
  CommandFn,
  GetContextListFn,
  GitAddCommandFn,
  GitCommitCommandFn,
  GitCommitMessageFn,
  GitPushCommandFn,
  PromptFn,
  SetupFn,
  TeardownFn,
} from '@lumpcode/core';
import {
  defineBranchFn,
  defineCommand,
  defineCommandModule,
  defineCommandSetup,
  defineCommandTeardown,
  defineConfig,
  defineContextMatchFn,
  defineContextOptionsFn,
  defineGetContextListFn,
  defineGitAddCommandFn,
  defineGitCommitCommandFn,
  defineGitCommitMessageFn,
  defineGitPushCommandFn,
  definePostCommandExecFn,
  definePromptFn,
  defineSetupFn,
  defineStep,
  defineTeardownFn,
  type CommandModule,
  type ContextMatchFn,
  type LumpJsConfig,
  type LumpJsConfigPostCommandExecFn,
  type LumpJsConfigStep,
} from '@lumpcode/cli-utils';

type V = { model?: string; myHookFlag: boolean };
type SV = { model?: string; newChat?: boolean; stepOnly: number };

describe('define* helpers @lumpcode/cli-utils (D1–D10)', () => {
  it('D1: defineConfig<V, SV> returns LumpJsConfig<V, SV>; excess keys error', () => {
    const cfg = defineConfig<V, SV>({
      baseBranch: 'main',
      lumpVariables: { myHookFlag: true, model: 'auto' },
      steps: [{ stepVariables: { stepOnly: 1, newChat: true, model: 'auto' } }],
    });
    expectTypeOf(cfg).toEqualTypeOf<LumpJsConfig<V, SV>>();
    expectTypeOf(cfg.lumpVariables).toEqualTypeOf<V | undefined>();

    defineConfig<V, SV>({
      lumpVariables: { myHookFlag: true },
      steps: [{
        // @ts-expect-error — closed SV
        stepVariables: { stepOnly: 1, notAStepKey: true },
      }],
    });
  });

  it('D2: defineStep does not widen stepVariables to StepVariables', () => {
    const step = defineStep<V, SV>({
      stepVariables: { stepOnly: 1, newChat: true },
    });
    expectTypeOf(step).toEqualTypeOf<LumpJsConfigStep<V, SV>>();
    expectTypeOf(step.stepVariables).toEqualTypeOf<SV | undefined>();
  });

  it('D3: definePromptFn preserves PromptFn<V, SV>', () => {
    const fn = definePromptFn<V, SV>((params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      expectTypeOf(params.stepVariables).toEqualTypeOf<SV | undefined>();
      return '';
    });
    expectTypeOf(fn).toEqualTypeOf<PromptFn<V, SV>>();
  });

  it('D4: defineCommand preserves CommandFn<V, SV>', () => {
    const fn = defineCommand<V, SV>((params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      expectTypeOf(params.stepVariables).toEqualTypeOf<SV | undefined>();
      return { executable: 'echo', args: [] };
    });
    expectTypeOf(fn).toEqualTypeOf<CommandFn<V, SV>>();
  });

  it('D5: definePostCommandExecFn preserves LumpJsConfigPostCommandExecFn<V, SV>', () => {
    const fn = definePostCommandExecFn<V, SV>((params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      expectTypeOf(params.stepVariables).toEqualTypeOf<SV | undefined>();
    });
    expectTypeOf(fn).toEqualTypeOf<LumpJsConfigPostCommandExecFn<V, SV>>();
  });

  it('D6: defineCommandModule<V, SV> does not erase to bare CommandModule', () => {
    const mod = defineCommandModule<V, SV>({
      command: (params) => {
        expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
        expectTypeOf(params.stepVariables).toEqualTypeOf<SV | undefined>();
        return { executable: 'echo', args: [] };
      },
      setup: (params) => {
        expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
        return {};
      },
      teardown: (params) => {
        expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      },
    });
    expectTypeOf(mod).toEqualTypeOf<CommandModule<V, SV>>();
    expectTypeOf(mod.command).toEqualTypeOf<CommandFn<V, SV>>();
  });

  it('D7: lump-only define* refine V without forcing SV', () => {
    const setup = defineCommandSetup<V>((params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      return {};
    });
    const teardown = defineCommandTeardown<V>((params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
    });
    const setupFn = defineSetupFn<V>((params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      return {};
    });
    const teardownFn = defineTeardownFn<V>((params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
    });
    const branch = defineBranchFn<V>((params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      return 'b';
    });
    const getList = defineGetContextListFn<V>((params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      return [];
    });
    const commitMsg = defineGitCommitMessageFn<V>((params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      return 'm';
    });
    const match = defineContextMatchFn<V>((params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      return { contextName: 'c', filePathVariableName: 'F' };
    });
    expectTypeOf(setup).toEqualTypeOf<SetupFn<V>>();
    expectTypeOf(teardown).toEqualTypeOf<TeardownFn<V>>();
    expectTypeOf(setupFn).toEqualTypeOf<SetupFn<V>>();
    expectTypeOf(teardownFn).toEqualTypeOf<TeardownFn<V>>();
    expectTypeOf(branch).toEqualTypeOf<BranchFn<V>>();
    expectTypeOf(getList).toEqualTypeOf<GetContextListFn<V>>();
    expectTypeOf(commitMsg).toEqualTypeOf<GitCommitMessageFn<V>>();
    expectTypeOf(match).toEqualTypeOf<ContextMatchFn<V>>();
  });

  it('D8: git / contextOptions helpers stay unparameterized', () => {
    const add = defineGitAddCommandFn((input) => `git add ${input.context.name}`);
    const commit = defineGitCommitCommandFn((input) => `git commit -m ${input.commitMessage}`);
    const push = defineGitPushCommandFn(() => 'git push');
    const opts = defineContextOptionsFn(() => undefined);
    expectTypeOf(add).toEqualTypeOf<GitAddCommandFn>();
    expectTypeOf(commit).toEqualTypeOf<GitCommitCommandFn>();
    expectTypeOf(push).toEqualTypeOf<GitPushCommandFn>();
    void opts;
    // @ts-expect-error — no new type params on defineGitAddCommandFn
    defineGitAddCommandFn<V>(() => 'git add');
  });

  it('D9: defineConfig without type args stays assignable', () => {
    const cfg = defineConfig({
      baseBranch: 'main',
      lumpVariables: { anything: 1 },
      steps: [{ stepVariables: { alsoAnything: true } }],
    });
    expectTypeOf(cfg).toMatchTypeOf<LumpJsConfig>();
  });

  it('D10: erasure guard — return is LumpJsConfig<V, SV> not bare LumpJsConfig', () => {
    const cfg = defineConfig<V, SV>({
      lumpVariables: { myHookFlag: true },
      steps: [{ stepVariables: { stepOnly: 1 } }],
    });
    expectTypeOf(cfg).toEqualTypeOf<LumpJsConfig<V, SV>>();
    expectTypeOf(cfg).not.toEqualTypeOf<LumpJsConfig>();
  });
});

describe('dynamic-discovery-branch author discoveryBranch types (G1t/G2t)', () => {
  it('G1t/G2t: documents required discoveryBranch on author CLI types (activate when types land)', () => {
    // Expected post-impl author input shape (CLI-local, not core):
    type AuthorListParams = {
      codeBasePaths: unknown[];
      lumpVariables: V;
      discoveryBranch: string;
    };
    type AuthorMatchParams = {
      codeBasePath: unknown;
      codeBasePaths: unknown[];
      lumpVariables: V;
      discoveryBranch: string;
    };
    expectTypeOf<AuthorListParams['discoveryBranch']>().toEqualTypeOf<string>();
    expectTypeOf<AuthorMatchParams['discoveryBranch']>().toEqualTypeOf<string>();
    // When CLI GetContextListFn / ContextMatchFn gain required discoveryBranch,
    // replace with expectTypeOf on defineGetContextListFn / defineContextMatchFn params.
  });
});
