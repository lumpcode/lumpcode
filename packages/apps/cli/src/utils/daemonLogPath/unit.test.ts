import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { daemonLogPath } from './main';

type DaemonLogPath = (input: {
    daemonsDir: string;
    projectName: string;
    daemonId: string;
}) => string;

/**
 * daemon-id-and-filters P3 (log).
 * Skipped until path helpers require daemonId.
 */
describe('daemonLogPath (daemon-id-and-filters P*)', () => {
    const daemonsDir = '/home/.lumpcode/daemons';
    const logPath = daemonLogPath as unknown as DaemonLogPath;

    it('P3: global write target is project.global.daemon.log (never bare)', () => {
        expect(logPath({ daemonsDir, projectName: 'demo', daemonId: 'global' })).toBe(
            path.join(daemonsDir, 'demo.global.daemon.log'),
        );
    });

    it('P3: filtered id log path', () => {
        expect(logPath({ daemonsDir, projectName: 'demo', daemonId: 'agents' })).toBe(
            path.join(daemonsDir, 'demo.agents.daemon.log'),
        );
    });
});
