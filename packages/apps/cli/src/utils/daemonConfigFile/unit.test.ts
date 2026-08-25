import { createHash } from 'node:crypto';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { DEFAULT_DAEMON_CRON_SETUP } from '../../consts';
import {
    daemonConfigFileSchema,
    hashDaemonConfigFile,
    normalizeDaemonConfigFile,
    type DaemonConfigFile,
} from './main';

function expectParseOk(input: unknown): DaemonConfigFile {
    const result = daemonConfigFileSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    return result.data;
}

describe('daemonConfigFileSchema', () => {
    it('accepts a minimal valid recipe', () => {
        expect(expectParseOk({ discoveryBranch: 'dev' })).toEqual({ discoveryBranch: 'dev' });
    });

    it('rejects glob discoveryBranch', () => {
        expect(daemonConfigFileSchema.safeParse({ discoveryBranch: 'feature/*' }).success).toBe(false);
        expect(daemonConfigFileSchema.safeParse({ discoveryBranch: 'feat?' }).success).toBe(false);
    });

    it('rejects empty discoveryBranch', () => {
        expect(daemonConfigFileSchema.safeParse({ discoveryBranch: '' }).success).toBe(false);
    });

    it('rejects extra keys (strict)', () => {
        expect(
            daemonConfigFileSchema.safeParse({
                discoveryBranch: 'dev',
                daemonId: 'nightly',
            }).success,
        ).toBe(false);
        expect(
            daemonConfigFileSchema.safeParse({
                discoveryBranch: 'dev',
                unknown: true,
            }).success,
        ).toBe(false);
    });

    it('rejects non-positive maxParallelRun', () => {
        expect(
            daemonConfigFileSchema.safeParse({
                discoveryBranch: 'dev',
                maxParallelRun: 0,
            }).success,
        ).toBe(false);
        expect(
            daemonConfigFileSchema.safeParse({
                discoveryBranch: 'dev',
                maxParallelRun: 1.5,
            }).success,
        ).toBe(false);
    });
});

describe('normalizeDaemonConfigFile / hashDaemonConfigFile', () => {
    it('applies default cronSetup and disabled', () => {
        expect(normalizeDaemonConfigFile({ discoveryBranch: 'dev' })).toEqual({
            discoveryBranch: 'dev',
            cronSetup: DEFAULT_DAEMON_CRON_SETUP,
            disabled: false,
        });
    });

    it('omits empty include/exclude and sorts non-empty lists', () => {
        expect(
            normalizeDaemonConfigFile({
                discoveryBranch: 'dev',
                include: [],
                exclude: [],
            }),
        ).toEqual({
            discoveryBranch: 'dev',
            cronSetup: DEFAULT_DAEMON_CRON_SETUP,
            disabled: false,
        });
        expect(
            normalizeDaemonConfigFile({
                discoveryBranch: 'dev',
                include: ['zeta', 'alpha'],
                exclude: ['b', 'a'],
            }),
        ).toEqual({
            discoveryBranch: 'dev',
            cronSetup: DEFAULT_DAEMON_CRON_SETUP,
            disabled: false,
            include: ['alpha', 'zeta'],
            exclude: ['a', 'b'],
        });
    });

    it('hashes omit vs default cronSetup/disabled the same', () => {
        const omitted = hashDaemonConfigFile({ discoveryBranch: 'dev' });
        const explicit = hashDaemonConfigFile({
            discoveryBranch: 'dev',
            cronSetup: DEFAULT_DAEMON_CRON_SETUP,
            disabled: false,
        });
        expect(omitted).toBe(explicit);
        expect(omitted).toMatch(/^[a-f0-9]{64}$/);
    });

    it('hashes omit vs empty include/exclude the same', () => {
        const omitted = hashDaemonConfigFile({ discoveryBranch: 'main' });
        const empty = hashDaemonConfigFile({
            discoveryBranch: 'main',
            include: [],
            exclude: [],
        });
        expect(omitted).toBe(empty);
    });

    it('hashes unsorted include the same as sorted', () => {
        expect(
            hashDaemonConfigFile({ discoveryBranch: 'dev', include: ['b', 'a'] }),
        ).toBe(hashDaemonConfigFile({ discoveryBranch: 'dev', include: ['a', 'b'] }));
    });

    it('hashes key-order-equivalent objects the same', () => {
        const a = expectParseOk({
            disabled: true,
            discoveryBranch: 'dev',
            cronSetup: '*/10 * * * *',
            include: ['backlog'],
        });
        const b = expectParseOk({
            include: ['backlog'],
            cronSetup: '*/10 * * * *',
            discoveryBranch: 'dev',
            disabled: true,
        });
        expect(hashDaemonConfigFile(a)).toBe(hashDaemonConfigFile(b));
    });

    it('hashes JSON- and YAML-parsed equivalents the same', () => {
        const jsonRaw = JSON.stringify({
            discoveryBranch: 'feat/team-a',
            include: ['agents', 'backlog'],
            cronSetup: '*/15 * * * *',
            disabled: false,
        });
        const yamlRaw = `
discoveryBranch: feat/team-a
# comment ignored by parser
include:
  - backlog
  - agents
cronSetup: "*/15 * * * *"
disabled: false
`;
        const fromJson = expectParseOk(JSON.parse(jsonRaw));
        const fromYaml = expectParseOk(loadYaml(yamlRaw));
        expect(hashDaemonConfigFile(fromJson)).toBe(hashDaemonConfigFile(fromYaml));
    });

    it('changes hash when a semantic field changes', () => {
        const base = hashDaemonConfigFile({ discoveryBranch: 'dev', include: ['a'] });
        const changed = hashDaemonConfigFile({ discoveryBranch: 'dev', include: ['b'] });
        expect(base).not.toBe(changed);
    });

    it('matches SHA-256 of sorted-key normalized JSON', () => {
        const parsed = expectParseOk({
            discoveryBranch: 'dev',
            include: ['z', 'a'],
            maxParallelRun: 2,
        });
        const expectedPayload = JSON.stringify({
            cronSetup: DEFAULT_DAEMON_CRON_SETUP,
            disabled: false,
            discoveryBranch: 'dev',
            include: ['a', 'z'],
            maxParallelRun: 2,
        });
        expect(hashDaemonConfigFile(parsed)).toBe(
            createHash('sha256').update(expectedPayload).digest('hex'),
        );
    });
});
