import { afterEach, describe, expect, it, vi } from 'vitest';

import { isProcessAlive } from './main';

describe('isProcessAlive', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns true for the current process', () => {
        expect(isProcessAlive(process.pid)).toBe(true);
    });

    it('returns false when the process does not exist', () => {
        expect(isProcessAlive(2_000_000_000)).toBe(false);
    });

    it('rethrows non-ESRCH probe errors by default', () => {
        const probeError = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
        vi.spyOn(process, 'kill').mockImplementation(() => {
            throw probeError;
        });

        expect(() => isProcessAlive(42)).toThrow(probeError);
    });

    it('treats non-ESRCH probe errors as alive when onProbeError is alive', () => {
        const probeError = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
        vi.spyOn(process, 'kill').mockImplementation(() => {
            throw probeError;
        });

        expect(isProcessAlive(42, { onProbeError: 'alive' })).toBe(true);
    });

    it('treats non-ESRCH probe errors as dead when onProbeError is dead', () => {
        const probeError = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
        vi.spyOn(process, 'kill').mockImplementation(() => {
            throw probeError;
        });

        expect(isProcessAlive(42, { onProbeError: 'dead' })).toBe(false);
    });
});
