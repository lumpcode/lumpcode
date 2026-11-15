import type { PresetExtraArgsVariables } from './extraArgs';
import type { PresetSessionStepVariables } from './session';

export type ClaudeCodeAgentPermissions = {
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
};

export type ClaudeCodePresetLumpVariables = {
  model?: string;
  agentPermissions?: ClaudeCodeAgentPermissions;
} & PresetExtraArgsVariables;

export type ClaudeCodePresetStepVariables = ClaudeCodePresetLumpVariables &
  PresetSessionStepVariables;
