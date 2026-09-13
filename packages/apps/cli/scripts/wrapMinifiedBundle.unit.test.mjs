import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
    BUNDLE_MAX_LINE_LEN,
    wrapMinifiedBundle,
    wrapMinifiedBundleFile,
} from './wrapMinifiedBundle.mjs';

describe('wrapMinifiedBundle', () => {
    /** @type {string[]} */
    const tempDirs = [];

    afterEach(async () => {
        for (const dir of tempDirs.splice(0)) {
            await fs.promises.rm(dir, { recursive: true, force: true });
        }
    });

    it('wraps a one-line minified function so no line exceeds max_line_len', async () => {
        const src = `function lumpWorktreePath(e){${'if(!e.a)throw new Error("x");'.repeat(20)}}`;
        expect(src.includes('\n')).toBe(false);
        expect(src.length).toBeGreaterThan(BUNDLE_MAX_LINE_LEN);

        const wrapped = await wrapMinifiedBundle(src);
        const lines = wrapped.split('\n').filter((line) => line.length > 0);
        expect(lines.length).toBeGreaterThan(1);
        expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(BUNDLE_MAX_LINE_LEN);
        expect(wrapped).toContain('lumpWorktreePath');
    });

    it('throws when terser yields empty output for non-empty input', async () => {
        await expect(wrapMinifiedBundle('/* only a comment */')).rejects.toThrow(
            /terser wrap produced empty output/,
        );
    });

    it('rewrites a file in place', async () => {
        const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wrap-minified-bundle-'));
        tempDirs.push(dir);
        const filePath = path.join(dir, 'index.js');
        const src = `function lumpWorktreePath(e){${'if(!e.a)throw new Error("x");'.repeat(20)}}`;
        await fs.promises.writeFile(filePath, src, 'utf8');

        await wrapMinifiedBundleFile(filePath);

        const rewritten = await fs.promises.readFile(filePath, 'utf8');
        const lines = rewritten.split('\n').filter((line) => line.length > 0);
        expect(lines.length).toBeGreaterThan(1);
        expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(BUNDLE_MAX_LINE_LEN);
    });
});
