/**
 * Type-level contracts for CLI authoring types (A1–A6).
 * Source of truth: backlog typed-lump-and-step-variables testPlan §5.3.
 */
import { describe, it, expectTypeOf } from 'vitest';
import type { CommandFn, PromptFn, SetupFn, TeardownFn } from '@lumpcode/core';
import type { CommandModule } from './CommandModule';
import type { ContextMatchFn } from './ContextMatchFn';
import type { LumpJsConfig } from './LumpJsConfig';
import type { LumpJsConfigStep } from './LumpJsConfigStep';
import type {
  LumpJsConfigSteps,
  LumpJsConfigStepsFn,
  LumpJsConfigStepsItem,
  StepFn,
} from './LumpJsConfigSteps';
import type { LumpJsonConfig } from './LumpJsonConfig';
import type { LumpJsonConfigStep } from './LumpJsonConfigStep';

type V = { model?: string; myHookFlag: boolean };
type SV = { model?: string; newChat?: boolean; stepOnly: number };

describe('CLI authoring types <V, SV> (A1–A6)', () => {
  it('A1: LumpJsConfig<V, SV> accepts refined bags; excess step key errors', () => {
    const config: LumpJsConfig<V, SV> = {
      baseBranch: 'main',
      lumpVariables: { myHookFlag: true, model: 'auto' },
      steps: [
        {
          stepVariables: { stepOnly: 1, newChat: true, model: 'auto' },
        },
      ],
    };
    expectTypeOf(config.lumpVariables).toEqualTypeOf<V | undefined>();

    const step = (config.steps as LumpJsConfigStep<V, SV>[])[0];
    expectTypeOf(step.stepVariables).toEqualTypeOf<SV | undefined>();

    const badStep: LumpJsConfigStep<V, SV> = {
      // @ts-expect-error — closed SV rejects excess keys once stepVariables is SV
      stepVariables: { stepOnly: 1, notAStepKey: true },
    };
    void badStep;
  });

  it('A2: LumpJsConfigStep / Steps / StepsItem / StepFn carry bags; expander input omits SV', () => {
    const promptFn: PromptFn<V, SV> = (params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      expectTypeOf(params.stepVariables).toEqualTypeOf<SV | undefined>();
      return '';
    };
    const solo: LumpJsConfigStep<V, SV> = {
      stepVariables: { stepOnly: 3 },
      promptFn,
    };
    expectTypeOf(solo.stepVariables).toEqualTypeOf<SV | undefined>();

    const item: LumpJsConfigStepsItem<V, SV> = solo;
    expectTypeOf(item).toMatchTypeOf<LumpJsConfigStepsItem<V, SV>>();

    const steps: LumpJsConfigSteps<V, SV> = [solo];
    expectTypeOf(steps).toEqualTypeOf<LumpJsConfigSteps<V, SV>>();

    const stepFn: StepFn<V, SV> = (params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      expectTypeOf(params).not.toHaveProperty('stepVariables');
      return [solo];
    };
    const stepsFn: LumpJsConfigStepsFn<V, SV> = stepFn;
    const itemFromFn: LumpJsConfigStepsItem<V, SV> = stepsFn;
    expectTypeOf(stepsFn).toEqualTypeOf<LumpJsConfigStepsFn<V, SV>>();
    void itemFromFn;
  });

  it('A3: LumpJsonConfig / step carry SV; function fields excluded', () => {
    const json: LumpJsonConfig<V, SV> = {
      baseBranch: 'main',
      lumpVariables: { myHookFlag: true },
      steps: [
        {
          stepVariables: { stepOnly: 1 },
          promptTemplate: 'hello',
        } satisfies LumpJsonConfigStep<V, SV>,
      ],
    };
    expectTypeOf(json.lumpVariables).toEqualTypeOf<V | undefined>();

    // Function-valued hooks are not part of JSON config
    expectTypeOf<LumpJsonConfig<V, SV>>().not.toHaveProperty('branchFn');
  });

  it('A4: CommandModule command is dual-generic; setup/teardown lump-only', () => {
    const command: CommandFn<V, SV> = (params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      expectTypeOf(params.stepVariables).toEqualTypeOf<SV | undefined>();
      return { executable: 'echo', args: [] };
    };
    const setup: SetupFn<V> = (params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      return {};
    };
    const teardown: TeardownFn<V> = (params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
    };
    const mod: CommandModule<V, SV> = { command, setup, teardown };
    expectTypeOf(mod.command).toEqualTypeOf<CommandFn<V, SV>>();
    expectTypeOf(mod.setup).toEqualTypeOf<SetupFn<V> | undefined>();
    expectTypeOf(mod.teardown).toEqualTypeOf<TeardownFn<V> | undefined>();
  });

  it('A5: ContextMatchFn<V> refines lumpVariables', () => {
    const match: ContextMatchFn<V> = (params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      return { contextName: 'c', filePathVariableName: 'FILE' };
    };
    void match;
  });

  it('A6: untyped defaults remain assignable', () => {
    const config: LumpJsConfig = {
      baseBranch: 'main',
      lumpVariables: { anything: 1 },
      steps: [{ stepVariables: { alsoAnything: true } }],
    };
    const mod: CommandModule = {
      command: () => ({ executable: 'echo', args: [] }),
    };
    expectTypeOf(config).toMatchTypeOf<LumpJsConfig>();
    expectTypeOf(mod).toMatchTypeOf<CommandModule>();
  });
});
