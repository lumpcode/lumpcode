import type { PresetSessionStepVariables } from './session';

export type OpenCodeAgentPermissions = {
  auto?: boolean;
  agent?: string;
};

export type OpenCodePresetLumpVariables = {
  model?: string;
  agentPermissions?: OpenCodeAgentPermissions;
};

export type OpenCodePresetStepVariables = OpenCodePresetLumpVariables &
  PresetSessionStepVariables;
