import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    supervisorDirPath,
    supervisorLogPath,
    supervisorMetaPath,
    supervisorPidPath,
} from './main';

describe('supervisorPaths', () => {
    const globalConfigFolderPath = '/home/.lumpcode';
    const projectName = 'demo_proj';

    it('places supervisor files under ~/.lumpcode/supervisor/<projectName>.*', () => {
        const dir = supervisorDirPath({ globalConfigFolderPath });
        expect(dir).toBe(path.join(globalConfigFolderPath, 'supervisor'));
        expect(supervisorPidPath({ globalConfigFolderPath, projectName })).toBe(
            path.join(dir, 'demo_proj.pid'),
        );
        expect(supervisorLogPath({ globalConfigFolderPath, projectName })).toBe(
            path.join(dir, 'demo_proj.log'),
        );
        expect(supervisorMetaPath({ globalConfigFolderPath, projectName })).toBe(
            path.join(dir, 'demo_proj.meta.json'),
        );
    });
});
