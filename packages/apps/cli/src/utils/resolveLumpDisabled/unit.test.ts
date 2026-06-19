import * as path from 'node:path';
import { describe, it, expect } from 'vitest';

import { resolveLumpDisabled } from './main';

const FIXTURES_DIR = path.resolve(__dirname, '../jsConfigToRunLumpInput/__fixtures__/local-config');

describe('resolveLumpDisabled', () => {
    it('returns false when disabled is undefined', async () => {
        const result = await resolveLumpDisabled(undefined);
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.disabled).toBe(false);
    });

    it('returns true for boolean true', async () => {
        const result = await resolveLumpDisabled(true);
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.disabled).toBe(true);
    });

    it('resolves sync function', async () => {
        const result = await resolveLumpDisabled(() => true);
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.disabled).toBe(true);
    });

    it('resolves async function', async () => {
        const result = await resolveLumpDisabled(async () => true);
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.disabled).toBe(true);
    });

    it('resolves FilePath import', async () => {
        const hookPath = path.join(FIXTURES_DIR, 'hooks', 'disabled.js');
        const result = await resolveLumpDisabled(hookPath);
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.disabled).toBe(true);
    });
});
