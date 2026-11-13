import type { PresetExtraArgsVariables } from './extraArgs';
import type { PresetSessionStepVariables } from './session';

export type CursorAgentPermissions = {
  cursorConfigDir?: string;
};

export type CursorPresetLumpVariables = {
  model?: string;
  agentPermissions?: CursorAgentPermissions;
} & PresetExtraArgsVariables;

export type CursorPresetStepVariables = CursorPresetLumpVariables &
  PresetSessionStepVariables;
