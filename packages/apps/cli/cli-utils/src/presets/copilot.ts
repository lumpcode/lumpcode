import type { PresetSessionStepVariables } from './session';

export type CopilotAgentPermissions = {
  writablePaths?: readonly string[];
  denyShell?: readonly string[];
};

export type CopilotPresetLumpVariables = {
  model?: string;
  agentPermissions?: CopilotAgentPermissions;
};

export type CopilotPresetStepVariables = CopilotPresetLumpVariables &
  PresetSessionStepVariables;
