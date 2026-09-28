import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { ResolvedProjectLocalConfig } from '../../types/ResolvedProjectLocalConfig';
import { fingerprintResolvedLocalConfig } from './main';

function sampleConfig(
    overrides: Partial<ResolvedProjectLocalConfig> = {},
): ResolvedProjectLocalConfig {
    return {
        projectName: 'demo',
        mode: 'dedicated',
        workspaceStrategy: 'worktree',
        primaryBranch: 'dev',
        maxParallelRun: 2,
        ...overrides,
    };
}

/** UTF-8 JSON with object keys sorted at every object level; arrays keep order. */
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

function expectedFingerprint(config: ResolvedProjectLocalConfig): string {
    return createHash('sha256').update(JSON.stringify(canonicalize(config))).digest('hex');
}

describe.skip('fingerprintResolvedLocalConfig (daemon-snapshot-meta-schema)', () => {
    it('returns the same SHA-256 hex for identical configs regardless of key order', () => {
        const insertionA: ResolvedProjectLocalConfig = {
            maxParallelRun: 2,
            mode: 'dedicated',
            primaryBranch: 'dev',
            projectName: 'demo',
            workspaceStrategy: 'worktree',
        };
        const insertionB: ResolvedProjectLocalConfig = {
            projectName: 'demo',
            workspaceStrategy: 'worktree',
            primaryBranch: 'dev',
            mode: 'dedicated',
            maxParallelRun: 2,
        };
        expect(fingerprintResolvedLocalConfig(insertionA)).toBe(
            fingerprintResolvedLocalConfig(insertionB),
        );
        expect(fingerprintResolvedLocalConfig(insertionA)).toBe(expectedFingerprint(insertionA));
        expect(fingerprintResolvedLocalConfig(insertionA)).toMatch(/^[a-f0-9]{64}$/);
    });

    it('matches SHA-256 of UTF-8 JSON with object keys sorted at every object level', () => {
        const config = sampleConfig({
            disabled: true,
            verbose: false,
            refreshCommand: 'git fetch origin',
            primaryBranches: ['dev', 'release'],
        });
        expect(fingerprintResolvedLocalConfig(config)).toBe(expectedFingerprint(config));
    });

    it('changes when a resolved field changes and preserves array order', () => {
        const base = sampleConfig({ primaryBranches: ['dev', 'main'] });
        expect(fingerprintResolvedLocalConfig(base)).not.toBe(
            fingerprintResolvedLocalConfig(sampleConfig({ primaryBranches: ['main', 'dev'] })),
        );
        expect(fingerprintResolvedLocalConfig(base)).not.toBe(
            fingerprintResolvedLocalConfig(sampleConfig({ maxParallelRun: 3 })),
        );
    });
});
