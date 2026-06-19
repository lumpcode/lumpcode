import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { projectJsonPath } from './main';

describe('projectJsonPath', () => {
    it('resolves project.json under the local config folder', () => {
        const localConfigFolderPath = '/repo/.lumpcode';
        expect(projectJsonPath({ localConfigFolderPath })).toBe(
            path.join(localConfigFolderPath, 'project.json'),
        );
    });
});
