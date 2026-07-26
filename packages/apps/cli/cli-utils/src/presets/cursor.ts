/**
 * testImpl stubs — wrong/open shapes so closed-contract type tests stay red until implementation.
 * Real contracts: closed keys, no index signature (see backlog requirements).
 */

/** @stub loose until closed CursorAgentPermissions lands */
export type CursorAgentPermissions = Record<string, unknown>;

/** @stub loose until closed CursorPresetLumpVariables lands */
export type CursorPresetLumpVariables = Record<string, unknown>;

/** @stub incomplete — must become CursorPresetLumpVariables & PresetSessionStepVariables */
export type CursorPresetStepVariables = Record<string, unknown>;
