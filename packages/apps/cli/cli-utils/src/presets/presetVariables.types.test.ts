/**
 * Closed preset variable contracts (P1–P12 cursor/copilot; T1–T9 claude-code/opencode/codex).
 * Source files live under cli-utils/src/presets/ (barrel-exported from package root).
 */
import { describe, it, expectTypeOf } from 'vitest';
import {
  defineConfig,
  type ClaudeCodeAgentPermissions,
  type ClaudeCodePresetLumpVariables,
  type ClaudeCodePresetStepVariables,
  type CodexAgentPermissions,
  type CodexPresetLumpVariables,
  type CodexPresetStepVariables,
  type CopilotAgentPermissions,
  type CopilotPresetLumpVariables,
  type CopilotPresetStepVariables,
  type CursorAgentPermissions,
  type CursorPresetLumpVariables,
  type CursorPresetStepVariables,
  type OpenCodeAgentPermissions,
  type OpenCodePresetLumpVariables,
  type OpenCodePresetStepVariables,
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

const validClaudeCodeLump = {
  model: 'sonnet',
  agentPermissions: {
    permissionMode: 'acceptEdits',
    allowedTools: ['Read'],
    disallowedTools: ['Bash(git commit *)'],
    bare: true,
    addDirs: ['/tmp'],
  },
} as const;

const validOpenCodeLump = {
  model: 'provider/model',
  agentPermissions: {
    auto: true,
    agent: 'build',
  },
} as const;

const validCodexLump = {
  model: 'auto',
  agentPermissions: {
    sandbox: 'workspace-write',
    dangerouslyBypassApprovalsAndSandbox: false,
    addDirs: ['/tmp'],
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

describe('preset contracts from @lumpcode/cli-utils (P1–P12)', () => {
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
      writablePaths?: readonly string[];
      denyShell?: readonly string[];
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
    // Fresh literals — excess property checking does not apply to widened variables.
    // @ts-expect-error — closed CursorPresetLumpVariables
    const badCursorLump: CursorPresetLumpVariables = { model: 'auto', unknownPresetOption: 1 };
    // @ts-expect-error — closed CopilotPresetLumpVariables
    const badCopilotLump: CopilotPresetLumpVariables = { model: 'auto', unknownPresetOption: 1 };
    // @ts-expect-error — closed CursorPresetStepVariables
    const badCursorStep: CursorPresetStepVariables = { model: 'auto', unknownPresetOption: 1 };
    // @ts-expect-error — closed CopilotPresetStepVariables
    const badCopilotStep: CopilotPresetStepVariables = { model: 'auto', unknownPresetOption: 1 };
    void excessKeyBag;
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

describe('claude-code / opencode / codex preset contracts (T1–T9)', () => {
  it('T1: nine new preset type names resolve from package root', () => {
    expectTypeOf<ClaudeCodeAgentPermissions>().not.toBeNever();
    expectTypeOf<ClaudeCodePresetLumpVariables>().not.toBeNever();
    expectTypeOf<ClaudeCodePresetStepVariables>().not.toBeNever();
    expectTypeOf<OpenCodeAgentPermissions>().not.toBeNever();
    expectTypeOf<OpenCodePresetLumpVariables>().not.toBeNever();
    expectTypeOf<OpenCodePresetStepVariables>().not.toBeNever();
    expectTypeOf<CodexAgentPermissions>().not.toBeNever();
    expectTypeOf<CodexPresetLumpVariables>().not.toBeNever();
    expectTypeOf<CodexPresetStepVariables>().not.toBeNever();
    expectTypeOf<PresetSessionStepVariables>().not.toBeNever();
  });

  it('T2: each *AgentPermissions equals the closed field set', () => {
    expectTypeOf<ClaudeCodeAgentPermissions>().toEqualTypeOf<{
      permissionMode?:
        | 'default'
        | 'acceptEdits'
        | 'plan'
        | 'auto'
        | 'dontAsk'
        | 'bypassPermissions';
      allowedTools?: readonly string[];
      disallowedTools?: readonly string[];
      bare?: boolean;
      addDirs?: readonly string[];
    }>();
    expectTypeOf<OpenCodeAgentPermissions>().toEqualTypeOf<{
      auto?: boolean;
      agent?: string;
    }>();
    expectTypeOf<CodexAgentPermissions>().toEqualTypeOf<{
      sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
      dangerouslyBypassApprovalsAndSandbox?: boolean;
      addDirs?: readonly string[];
    }>();
  });

  it('T3: each *PresetLumpVariables is model + agentPermissions only', () => {
    expectTypeOf<ClaudeCodePresetLumpVariables>().toEqualTypeOf<{
      model?: string;
      agentPermissions?: ClaudeCodeAgentPermissions;
    }>();
    expectTypeOf<OpenCodePresetLumpVariables>().toEqualTypeOf<{
      model?: string;
      agentPermissions?: OpenCodeAgentPermissions;
    }>();
    expectTypeOf<CodexPresetLumpVariables>().toEqualTypeOf<{
      model?: string;
      agentPermissions?: CodexAgentPermissions;
    }>();
    const claudeOk: ClaudeCodePresetLumpVariables = validClaudeCodeLump;
    const openCodeOk: OpenCodePresetLumpVariables = validOpenCodeLump;
    const codexOk: CodexPresetLumpVariables = validCodexLump;
    void claudeOk;
    void openCodeOk;
    void codexOk;
  });

  it('T4: each *PresetStepVariables equals lump & PresetSessionStepVariables', () => {
    expectTypeOf<ClaudeCodePresetStepVariables>().toEqualTypeOf<
      ClaudeCodePresetLumpVariables & PresetSessionStepVariables
    >();
    expectTypeOf<OpenCodePresetStepVariables>().toEqualTypeOf<
      OpenCodePresetLumpVariables & PresetSessionStepVariables
    >();
    expectTypeOf<CodexPresetStepVariables>().toEqualTypeOf<
      CodexPresetLumpVariables & PresetSessionStepVariables
    >();
    const sessionOk: ClaudeCodePresetStepVariables = {
      ...validClaudeCodeLump,
      ...validSessionStep,
    };
    void sessionOk;
  });

  it('T5: session keys excluded from lump contracts', () => {
    // @ts-expect-error — newChat is step-only
    const badClaude: ClaudeCodePresetLumpVariables = { newChat: true };
    // @ts-expect-error — chatIdIndex is step-only
    const badOpenCode: OpenCodePresetLumpVariables = { chatIdIndex: '0' };
    // @ts-expect-error — newChat is step-only
    const badCodex: CodexPresetLumpVariables = { newChat: true };
    void badClaude;
    void badOpenCode;
    void badCodex;
  });

  it('T6: closed keys reject excess on lump/step contracts', () => {
    // Fresh literals — excess property checking does not apply to widened variables.
    // @ts-expect-error — closed ClaudeCodePresetLumpVariables
    const badClaudeLump: ClaudeCodePresetLumpVariables = { model: 'auto', unknownPresetOption: 1 };
    // @ts-expect-error — closed OpenCodePresetLumpVariables
    const badOpenCodeLump: OpenCodePresetLumpVariables = { model: 'auto', unknownPresetOption: 1 };
    // @ts-expect-error — closed CodexPresetLumpVariables
    const badCodexLump: CodexPresetLumpVariables = { model: 'auto', unknownPresetOption: 1 };
    // @ts-expect-error — closed ClaudeCodePresetStepVariables
    const badClaudeStep: ClaudeCodePresetStepVariables = { model: 'auto', unknownPresetOption: 1 };
    // @ts-expect-error — closed OpenCodePresetStepVariables
    const badOpenCodeStep: OpenCodePresetStepVariables = { model: 'auto', unknownPresetOption: 1 };
    // @ts-expect-error — closed CodexPresetStepVariables
    const badCodexStep: CodexPresetStepVariables = { model: 'auto', unknownPresetOption: 1 };
    void excessKeyBag;
    void badClaudeLump;
    void badOpenCodeLump;
    void badCodexLump;
    void badClaudeStep;
    void badOpenCodeStep;
    void badCodexStep;
  });

  it('T7: wrong value types rejected', () => {
    // @ts-expect-error — model must be string
    const badModel: ClaudeCodePresetLumpVariables = { model: 1 };
    // @ts-expect-error — bare must be boolean
    const badBare: ClaudeCodeAgentPermissions = { bare: 'yes' };
    // @ts-expect-error — auto must be boolean
    const badAuto: OpenCodeAgentPermissions = { auto: 'yes' };
    // @ts-expect-error — sandbox must be the closed union
    const badSandbox: CodexAgentPermissions = { sandbox: 'full' };
    void badModel;
    void badBare;
    void badAuto;
    void badSandbox;
  });

  it('T8: & Extra accepts customKey and preset fields; defineConfig compiles', () => {
    type ClaudeLump = ClaudeCodePresetLumpVariables & Extra;
    type ClaudeStep = ClaudeCodePresetStepVariables & Extra;
    type OpenCodeLump = OpenCodePresetLumpVariables & Extra;
    type OpenCodeStep = OpenCodePresetStepVariables & Extra;
    type CodexLump = CodexPresetLumpVariables & Extra;
    type CodexStep = CodexPresetStepVariables & Extra;

    const claudeLump: ClaudeLump = {
      model: 'auto',
      customKey: 'x',
      agentPermissions: { permissionMode: 'acceptEdits', bare: true },
    };
    const openCodeLump: OpenCodeLump = {
      model: 'provider/model',
      customKey: 'x',
      agentPermissions: { auto: false, agent: 'build' },
    };
    const codexLump: CodexLump = {
      model: 'auto',
      customKey: 'x',
      agentPermissions: { sandbox: 'read-only' },
    };
    const claudeStep: ClaudeStep = { newChat: true, customKey: 'x', model: 'auto' };
    void claudeLump;
    void openCodeLump;
    void codexLump;
    void claudeStep;
    expectTypeOf(claudeLump.customKey).toEqualTypeOf<string>();
    expectTypeOf(claudeStep.newChat).toEqualTypeOf<boolean | undefined>();

    const claudeCfg = defineConfig<ClaudeLump, ClaudeStep>({
      lumpVariables: { model: 'auto', customKey: 'x' },
      steps: [{ stepVariables: { newChat: true, customKey: 'x' } }],
    });
    const openCodeCfg = defineConfig<OpenCodeLump, OpenCodeStep>({
      lumpVariables: { customKey: 'x' },
      steps: [{ stepVariables: { chatIdIndex: '0', customKey: 'x' } }],
    });
    const codexCfg = defineConfig<CodexLump, CodexStep>({
      lumpVariables: { model: 'auto', customKey: 'x' },
      steps: [{ stepVariables: { newChat: true, customKey: 'x' } }],
    });
    void claudeCfg;
    void openCodeCfg;
    void codexCfg;
  });

  it('T9: no open index signature (exact toEqualTypeOf against closed aliases)', () => {
    type ClosedClaudeCodeLump = {
      model?: string;
      agentPermissions?: ClaudeCodeAgentPermissions;
    };
    type ClosedOpenCodeLump = {
      model?: string;
      agentPermissions?: OpenCodeAgentPermissions;
    };
    type ClosedCodexLump = {
      model?: string;
      agentPermissions?: CodexAgentPermissions;
    };
    expectTypeOf<ClaudeCodePresetLumpVariables>().toEqualTypeOf<ClosedClaudeCodeLump>();
    expectTypeOf<OpenCodePresetLumpVariables>().toEqualTypeOf<ClosedOpenCodeLump>();
    expectTypeOf<CodexPresetLumpVariables>().toEqualTypeOf<ClosedCodexLump>();
  });
});
