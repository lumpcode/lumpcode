import { describe, expect, it } from 'vitest';

import { daemonFileBaseName } from './main';

describe('daemonFileBaseName', () => {
    it('uses projectName for global daemons', () => {
        expect(daemonFileBaseName({ projectName: 'demo_proj' })).toBe('demo_proj');
    });

    it('uses projectName.lumpName for per-lump daemons', () => {
        expect(daemonFileBaseName({ projectName: 'demo_proj', lumpName: 'alpha' })).toBe('demo_proj.alpha');
    });
});
