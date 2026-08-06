import type { LumpJsConfig } from '../../types/LumpJsConfig';
import type { ResolvedProjectLocalConfig } from '../../types/ResolvedProjectLocalConfig';

const LUMP_DEFAULT_KEYS = [
    'command',
    'maximumNumberOfConcurrentBranches',
    'keepHistory',
    'verbose',
] as const satisfies ReadonlyArray<keyof LumpJsConfig & keyof ResolvedProjectLocalConfig>;

/**
 * Overlay lump-default keys from resolved project+local onto a loaded lump config
 * (lump > local > project; inherit only when lump value is `undefined`).
 * Does not mutate the input `jsConfig`.
 */
export function applyLumpConfigDefaults(input: {
    jsConfig: LumpJsConfig;
    resolved: ResolvedProjectLocalConfig;
}): LumpJsConfig {
    const { jsConfig, resolved } = input;
    const result: LumpJsConfig = { ...jsConfig };

    for (const key of LUMP_DEFAULT_KEYS) {
        if (result[key] !== undefined) {
            continue;
        }
        const fromResolved = resolved[key];
        if (fromResolved !== undefined) {
            (result as Record<string, unknown>)[key] = fromResolved;
        }
    }

    return result;
}
