import type { PresetSessionStepVariables } from './session';

export type CursorAgentPermissions = {
  cursorConfigDir?: string;
};

export type CursorPresetLumpVariables = {
  model?: string;
  agentPermissions?: CursorAgentPermissions;
};

export type CursorPresetStepVariables = CursorPresetLumpVariables &
  PresetSessionStepVariables;
