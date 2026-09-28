import type { ResolvedProjectLocalConfig } from '../../types/ResolvedProjectLocalConfig';

/** SHA-256 hex of canonical sorted-key JSON for a merged `ResolvedProjectLocalConfig`. */
export function fingerprintResolvedLocalConfig(_config: ResolvedProjectLocalConfig): string {
    throw new Error('not implemented');
}
