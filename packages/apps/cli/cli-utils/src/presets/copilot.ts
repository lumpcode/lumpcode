import type { PresetExtraArgsVariables } from './extraArgs';
import type { PresetSessionStepVariables } from './session';

export type CopilotAgentPermissions = {
  writablePaths?: readonly string[];
  denyShell?: readonly string[];
};

export type CopilotPresetLumpVariables = {
  model?: string;
  agentPermissions?: CopilotAgentPermissions;
} & PresetExtraArgsVariables;

export type CopilotPresetStepVariables = CopilotPresetLumpVariables &
  PresetSessionStepVariables;
