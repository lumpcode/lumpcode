import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { getExecutionWorkspacePath } from './main';

describe.skip('getExecutionWorkspacePath (shared-in-place-run)', () => {
    const sourceProjectRoot = '/tmp/source-checkout';
    const globalConfigFolderPath = '/tmp/home/.lumpcode';
    const projectName = 'demo';

    it('returns sourceProjectRoot in shared mode (no project-copies path)', () => {
        const result = getExecutionWorkspacePath({
            mode: 'shared',
            sourceProjectRoot,
            globalConfigFolderPath,
            projectName,
        });
        expect(result).toBe(path.resolve(sourceProjectRoot));
        expect(result).not.toContain('project-copies');
    });

    it('returns sourceProjectRoot in dedicated mode', () => {
        expect(
            getExecutionWorkspacePath({
                mode: 'dedicated',
                sourceProjectRoot,
                globalConfigFolderPath,
                projectName,
            }),
        ).toBe(path.resolve(sourceProjectRoot));
    });

    it('returns the same path for shared and dedicated', () => {
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
        expect(shared).toBe(dedicated);
    });
});
