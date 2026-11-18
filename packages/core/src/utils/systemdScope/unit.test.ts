import { describe, expect, it } from 'vitest';

import {
    detectSystemdScope,
    killSystemdScope,
    systemdScopeUnitName,
    wrapInSystemdScope,
} from './main';

describe('systemdScopeUnitName', () => {
    it('joins lump, context, and step with a random suffix', () => {
        const name = systemdScopeUnitName({ lumpName: 'backlog', contextName: 'ctx', stepIndex: [1, 2] });
        expect(name).toMatch(/^lump-backlog-ctx-1\.2-[0-9a-f]{6}\.scope$/);
    });

    it('replaces characters systemd does not accept and stays under the unit name limit', () => {
        const name = systemdScopeUnitName({
            lumpName: 'my lump',
            contextName: `todo/${'x'.repeat(400)}`,
            stepIndex: 0,
        });
        expect(name).toMatch(/^lump-my_lump-todo_x+-[0-9a-f]{6}\.scope$/);
        expect(name.length).toBeLessThanOrEqual(255);
    });

    it('omits the lump name when there is none', () => {
        expect(systemdScopeUnitName({ contextName: 'ctx', stepIndex: 3 })).toMatch(/^lump-ctx-3-[0-9a-f]{6}\.scope$/);
    });
});

describe('wrapInSystemdScope', () => {
    it('runs the command through systemd-run --user --scope', () => {
        expect(wrapInSystemdScope({ executable: 'cursor-agent', args: ['-p', 'hi'], unitName: 'u.scope' })).toEqual({
            executable: 'systemd-run',
            args: ['--user', '--scope', '--quiet', '--collect', '--unit=u.scope', '--', 'cursor-agent', '-p', 'hi'],
        });
    });
});

describe('detectSystemdScope', () => {
    it.skipIf(process.platform === 'linux')('is unavailable off Linux', async () => {
        expect(await detectSystemdScope()).toEqual({
            available: false,
            reason: `systemd is not available on ${process.platform}`,
        });
    });
});

describe.skipIf(!(await detectSystemdScope()).available)('killSystemdScope', () => {
    it('succeeds for a scope that no longer exists', async () => {
        const result = await killSystemdScope({ unitName: 'lump-missing-000000.scope' });
        expect(result.success).toBe(true);
    });
});
