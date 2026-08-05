import type { LumpJsConfig } from '../../types/LumpJsConfig';
import type { ResolvedProjectLocalConfig } from '../../types/ResolvedProjectLocalConfig';

/**
 * Overlay lump-default keys from resolved project+local onto a loaded lump config
 * (lump > local > project; inherit only when lump value is `undefined`).
 * Stub for clean-local-project-json-config (testImpl).
 */
export function applyLumpConfigDefaults(_input: {
    jsConfig: LumpJsConfig;
    resolved: ResolvedProjectLocalConfig;
}): LumpJsConfig {
    throw new Error('not implemented');
}
