import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { daemonMetaPath } from './main';

type DaemonMetaPath = (input: {
    daemonsDir: string;
    projectName: string;
    daemonId: string;
}) => string;

/**
 * daemon-id-and-filters P3 (meta).
 * Skipped until path helpers require daemonId.
 */
describe('daemonMetaPath (daemon-id-and-filters P*)', () => {
    const daemonsDir = '/home/.lumpcode/daemons';
    const metaPath = daemonMetaPath as unknown as DaemonMetaPath;

    it('P3: global write target is project.global.daemon.meta.json (never bare)', () => {
        expect(metaPath({ daemonsDir, projectName: 'demo', daemonId: 'global' })).toBe(
            path.join(daemonsDir, 'demo.global.daemon.meta.json'),
        );
    });

    it('P3: filtered id meta path', () => {
        expect(metaPath({ daemonsDir, projectName: 'demo', daemonId: 'agents' })).toBe(
            path.join(daemonsDir, 'demo.agents.daemon.meta.json'),
        );
    });
});
