/**
 * testImpl stubs — wrong/open shapes so closed-contract type tests stay red until implementation.
 */

/** @stub loose until closed CopilotAgentPermissions lands */
export type CopilotAgentPermissions = Record<string, unknown>;

/** @stub loose until closed CopilotPresetLumpVariables lands */
export type CopilotPresetLumpVariables = Record<string, unknown>;

/** @stub incomplete — must become CopilotPresetLumpVariables & PresetSessionStepVariables */
export type CopilotPresetStepVariables = Record<string, unknown>;
