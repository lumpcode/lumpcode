import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { getExecutionWorkspacePath } from './main';

describe('getExecutionWorkspacePath (in-place-workspace)', () => {
    const sourceProjectRoot = '/tmp/source-project';
    const globalConfigFolderPath = '/home/.lumpcode';
    const projectName = 'demo';

    it('returns sourceProjectRoot in shared mode (same as dedicated)', () => {
        const shared = getExecutionWorkspacePath({
            mode: 'shared',
            sourceProjectRoot,
            globalConfigFolderPath,
            projectName,
        });
        const dedicated = getExecutionWorkspacePath({
            mode: 'dedicated',
            sourceProjectRoot,
            globalConfigFolderPath,
            projectName,
        });

        expect(shared).toBe(path.resolve(sourceProjectRoot));
        expect(dedicated).toBe(path.resolve(sourceProjectRoot));
        expect(shared).toBe(dedicated);
        expect(shared).not.toContain('project-copies');
    });
});
