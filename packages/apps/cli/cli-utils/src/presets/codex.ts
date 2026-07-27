import type { PresetSessionStepVariables } from './session';

export type CodexAgentPermissions = {
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
  dangerouslyBypassApprovalsAndSandbox?: boolean;
  addDirs?: readonly string[];
};

export type CodexPresetLumpVariables = {
  model?: string;
  agentPermissions?: CodexAgentPermissions;
};

export type CodexPresetStepVariables = CodexPresetLumpVariables &
  PresetSessionStepVariables;
