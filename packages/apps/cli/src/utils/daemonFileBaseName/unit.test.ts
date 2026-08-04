import { describe, expect, it } from 'vitest';

import { daemonFileBaseName } from './main';

/** Post-implementation API shape (daemon-id-and-filters). */
type DaemonFileBaseName = (input: { projectName: string; daemonId: string }) => string;

/**
 * daemon-id-and-filters P1–P2.
 * Skipped until path helpers require daemonId and always include the id segment.
 */
describe('daemonFileBaseName (daemon-id-and-filters P*)', () => {
    const baseName = daemonFileBaseName as unknown as DaemonFileBaseName;

    it('P1: basename always includes id (global)', () => {
        expect(baseName({ projectName: 'demo', daemonId: 'global' })).toBe('demo.global');
    });

    it('P2: filtered id segment', () => {
        expect(baseName({ projectName: 'demo', daemonId: 'agents' })).toBe('demo.agents');
    });
});
