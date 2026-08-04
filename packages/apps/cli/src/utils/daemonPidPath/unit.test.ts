import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { daemonPidPath } from './main';

type DaemonPidPath = (input: {
    daemonsDir: string;
    projectName: string;
    daemonId: string;
}) => string;

/**
 * daemon-id-and-filters P3 (pid).
 * Skipped until path helpers require daemonId.
 */
describe('daemonPidPath (daemon-id-and-filters P*)', () => {
    const daemonsDir = '/home/.lumpcode/daemons';
    const pidPath = daemonPidPath as unknown as DaemonPidPath;

    it('P3: global write target is project.global.daemon.pid (never bare)', () => {
        expect(pidPath({ daemonsDir, projectName: 'demo', daemonId: 'global' })).toBe(
            path.join(daemonsDir, 'demo.global.daemon.pid'),
        );
        expect(pidPath({ daemonsDir, projectName: 'demo', daemonId: 'global' })).not.toBe(
            path.join(daemonsDir, 'demo.daemon.pid'),
        );
    });

    it('P3: filtered id pid path', () => {
        expect(pidPath({ daemonsDir, projectName: 'demo', daemonId: 'agents' })).toBe(
            path.join(daemonsDir, 'demo.agents.daemon.pid'),
        );
    });
});
