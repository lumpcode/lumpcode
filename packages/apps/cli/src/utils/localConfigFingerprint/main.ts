import { createHash } from 'node:crypto';

import type { ResolvedProjectLocalConfig } from '../../types/ResolvedProjectLocalConfig';

/**
 * UTF-8 JSON with object keys sorted at every object level. Arrays keep order.
 * `undefined` object values are omitted so insertion order cannot affect the hash.
 */
function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(canonicalize);
    }
    if (value !== null && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const ordered: Record<string, unknown> = {};
        for (const key of Object.keys(record).sort()) {
            const nested = record[key];
            if (nested === undefined) {
                continue;
            }
            ordered[key] = canonicalize(nested);
        }
        return ordered;
    }
    return value;
}

/** SHA-256 hex of canonical sorted-key JSON for a merged `ResolvedProjectLocalConfig`. */
export function fingerprintResolvedLocalConfig(config: ResolvedProjectLocalConfig): string {
    return createHash('sha256').update(JSON.stringify(canonicalize(config)), 'utf8').digest('hex');
}
