/**
 * Soft-align: same define* call patterns against @lumpcode/cli-types (S1–S2).
 * Package must remain importable; signatures match cli-utils.
 */
import { describe, it, expectTypeOf } from 'vitest';
import type { CommandFn, PromptFn, SetupFn } from '@lumpcode/core';
import {
  defineCommand,
  defineCommandModule,
  defineConfig,
  definePromptFn,
  defineStep,
  type CommandModule,
  type LumpJsConfig,
  type LumpJsConfigStep,
} from '@lumpcode/cli-types';

type V = { model?: string; myHookFlag: boolean };
type SV = { model?: string; newChat?: boolean; stepOnly: number };

describe('soft-align @lumpcode/cli-types define* (S1–S2)', () => {
  it('S2: package remains importable', async () => {
    await expect(import('@lumpcode/cli-types')).resolves.toBeTypeOf('object');
  });

  it('S1: defineConfig / defineStep / definePromptFn / defineCommand / defineCommandModule accept <V, SV>', () => {
    const cfg = defineConfig<V, SV>({
      lumpVariables: { myHookFlag: true, model: 'auto' },
      steps: [{ stepVariables: { stepOnly: 1, newChat: true } }],
    });
    expectTypeOf(cfg).toEqualTypeOf<LumpJsConfig<V, SV>>();

    const step = defineStep<V, SV>({ stepVariables: { stepOnly: 2 } });
    expectTypeOf(step).toEqualTypeOf<LumpJsConfigStep<V, SV>>();

    const prompt = definePromptFn<V, SV>((params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      expectTypeOf(params.stepVariables).toEqualTypeOf<SV | undefined>();
      return '';
    });
    expectTypeOf(prompt).toEqualTypeOf<PromptFn<V, SV>>();

    const command = defineCommand<V, SV>((params) => {
      expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
      return { executable: 'echo', args: [] };
    });
    expectTypeOf(command).toEqualTypeOf<CommandFn<V, SV>>();

    const mod = defineCommandModule<V, SV>({
      command: (params) => {
        expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
        return { executable: 'echo', args: [] };
      },
      setup: ((params) => {
        expectTypeOf(params.lumpVariables).toEqualTypeOf<V>();
        return {};
      }) satisfies SetupFn<V>,
    });
    expectTypeOf(mod).toEqualTypeOf<CommandModule<V, SV>>();
  });
});
