/**
 * Closed cursor/copilot preset variable contracts (P1–P12).
 * Source files live under cli-utils/src/presets/ (barrel-exported from package root).
 *
 * Skipped until implementation ships closed preset variable contracts.
 */
import { describe, it, expectTypeOf } from 'vitest';
import {
  defineConfig,
  type CopilotAgentPermissions,
  type CopilotPresetLumpVariables,
  type CopilotPresetStepVariables,
  type CursorAgentPermissions,
  type CursorPresetLumpVariables,
  type CursorPresetStepVariables,
  type PresetSessionStepVariables,
} from '@lumpcode/cli-utils';

type Extra = { customKey: string };

const validCursorLump = {
  model: 'auto',
  agentPermissions: { cursorConfigDir: '.cursor' },
} as const;

const validCopilotLump = {
  model: 'auto',
  agentPermissions: {
    writablePaths: ['src/**'],
    denyShell: ['git commit'],
  },
} as const;

const validSessionStep = {
  newChat: true,
  chatIdIndex: '0',
} as const;

const excessKeyBag = {
  model: 'auto',
  unknownPresetOption: 1,
} as const;

describe.skip('preset contracts from @lumpcode/cli-utils (P1–P12)', () => {
  it('P1: seven preset type names resolve from package root', () => {
    expectTypeOf<PresetSessionStepVariables>().not.toBeNever();
    expectTypeOf<CursorAgentPermissions>().not.toBeNever();
    expectTypeOf<CopilotAgentPermissions>().not.toBeNever();
    expectTypeOf<CursorPresetLumpVariables>().not.toBeNever();
    expectTypeOf<CopilotPresetLumpVariables>().not.toBeNever();
    expectTypeOf<CursorPresetStepVariables>().not.toBeNever();
    expectTypeOf<CopilotPresetStepVariables>().not.toBeNever();
  });

  it('P2: PresetSessionStepVariables exact optional keys', () => {
    expectTypeOf<PresetSessionStepVariables>().toEqualTypeOf<{
      newChat?: boolean;
      chatIdIndex?: string | null;
    }>();
  });

  it('P3: CursorAgentPermissions / CopilotAgentPermissions exact fields', () => {
    expectTypeOf<CursorAgentPermissions>().toEqualTypeOf<{
      cursorConfigDir?: string;
    }>();
    expectTypeOf<CopilotAgentPermissions>().toEqualTypeOf<{
      writablePaths?: string[];
      denyShell?: string[];
    }>();
  });

  it('P4: lump contracts are model + agentPermissions only', () => {
    expectTypeOf<CursorPresetLumpVariables>().toEqualTypeOf<{
      model?: string;
      agentPermissions?: CursorAgentPermissions;
    }>();
    expectTypeOf<CopilotPresetLumpVariables>().toEqualTypeOf<{
      model?: string;
      agentPermissions?: CopilotAgentPermissions;
    }>();
    const cursorOk: CursorPresetLumpVariables = validCursorLump;
    const copilotOk: CopilotPresetLumpVariables = validCopilotLump;
    void cursorOk;
    void copilotOk;
  });

  it('P5: step contracts equal lump & PresetSessionStepVariables', () => {
    expectTypeOf<CursorPresetStepVariables>().toEqualTypeOf<
      CursorPresetLumpVariables & PresetSessionStepVariables
    >();
    expectTypeOf<CopilotPresetStepVariables>().toEqualTypeOf<
      CopilotPresetLumpVariables & PresetSessionStepVariables
    >();
    const sessionOk: CursorPresetStepVariables = {
      ...validCursorLump,
      ...validSessionStep,
    };
    void sessionOk;
  });

  it('P6: session keys excluded from lump contracts', () => {
    // @ts-expect-error — newChat is step-only
    const bad: CursorPresetLumpVariables = { newChat: true };
    void bad;
  });

  it('P7: closed keys reject excess on lump/step contracts', () => {
    // @ts-expect-error — closed CursorPresetLumpVariables
    const badCursorLump: CursorPresetLumpVariables = excessKeyBag;
    // @ts-expect-error — closed CopilotPresetLumpVariables
    const badCopilotLump: CopilotPresetLumpVariables = excessKeyBag;
    // @ts-expect-error — closed CursorPresetStepVariables
    const badCursorStep: CursorPresetStepVariables = excessKeyBag;
    // @ts-expect-error — closed CopilotPresetStepVariables
    const badCopilotStep: CopilotPresetStepVariables = excessKeyBag;
    void badCursorLump;
    void badCopilotLump;
    void badCursorStep;
    void badCopilotStep;
  });

  it('P8: wrong value types rejected', () => {
    // @ts-expect-error — model must be string
    const bad: CursorPresetLumpVariables = { model: 1 };
    void bad;
  });

  it('P9: & Extra accepts customKey and preset fields', () => {
    type Lump = CursorPresetLumpVariables & Extra;
    type StepBag = CursorPresetStepVariables & Extra;
    const lump: Lump = { model: 'auto', customKey: 'x', agentPermissions: { cursorConfigDir: '.cursor' } };
    const step: StepBag = { newChat: true, customKey: 'x', model: 'auto' };
    void lump;
    void step;
    expectTypeOf(lump.customKey).toEqualTypeOf<string>();
    expectTypeOf(step.newChat).toEqualTypeOf<boolean | undefined>();
  });

  it('P10: consumer pattern defineConfig<Preset & Extra, …>', () => {
    const cfg = defineConfig<
      CursorPresetLumpVariables & Extra,
      CursorPresetStepVariables & Extra
    >({
      lumpVariables: { model: 'auto', customKey: 'x' },
      steps: [{ stepVariables: { newChat: true, customKey: 'x' } }],
    });
    void cfg;
  });

  it('P11: no open index signature (excess key must error — see P7)', () => {
    type ClosedCursorLump = {
      model?: string;
      agentPermissions?: CursorAgentPermissions;
    };
    expectTypeOf<CursorPresetLumpVariables>().toEqualTypeOf<ClosedCursorLump>();
  });
});
