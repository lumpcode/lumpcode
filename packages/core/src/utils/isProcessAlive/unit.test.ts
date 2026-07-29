import { afterEach, describe, expect, it, vi } from 'vitest';

import { isProcessAlive } from './main';

/** Skipped until kill-spawned-command-on-timeout-abort implementation migrates this util. */
describe.skip('isProcessAlive (A1–A5)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('A1: returns true for the current process', () => {
        expect(isProcessAlive(process.pid)).toBe(true);
    });

    it('A2: returns false when the process does not exist', () => {
        expect(isProcessAlive(2_000_000_000)).toBe(false);
    });

    it('A3: rethrows non-ESRCH probe errors by default', () => {
        const probeError = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
        vi.spyOn(process, 'kill').mockImplementation(() => {
            throw probeError;
        });

        expect(() => isProcessAlive(42)).toThrow(probeError);
    });

    it('A4: treats non-ESRCH probe errors as alive when onProbeError is alive', () => {
        const probeError = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
        vi.spyOn(process, 'kill').mockImplementation(() => {
            throw probeError;
        });

        expect(isProcessAlive(42, { onProbeError: 'alive' })).toBe(true);
    });

    it('A5: treats non-ESRCH probe errors as dead when onProbeError is dead', () => {
        const probeError = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
        vi.spyOn(process, 'kill').mockImplementation(() => {
            throw probeError;
        });

        expect(isProcessAlive(42, { onProbeError: 'dead' })).toBe(false);
    });
});
