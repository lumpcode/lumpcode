import * as fs from 'node:fs';

import { minify } from 'terser';

/** Max source line length in the production ncc bundle (Node prints the whole line on uncaught errors). */
export const BUNDLE_MAX_LINE_LEN = 120;

/**
 * Re-print minified JS at a max line length without re-compressing or mangling.
 * Token-safe (unlike inserting newlines with a regex).
 *
 * @param {string} code
 * @param {{ maxLineLen?: number }} [options]
 * @returns {Promise<string>}
 */
export async function wrapMinifiedBundle(code, options = {}) {
    const maxLineLen = options.maxLineLen ?? BUNDLE_MAX_LINE_LEN;
    const result = await minify(code, {
        compress: false,
        mangle: false,
        format: { max_line_len: maxLineLen, comments: false },
    });
    if (typeof result.code !== 'string' || (code.length > 0 && result.code.length === 0)) {
        throw new Error('terser wrap produced empty output');
    }
    return result.code;
}

/**
 * @param {string} filePath
 * @param {{ maxLineLen?: number }} [options]
 * @returns {Promise<void>}
 */
export async function wrapMinifiedBundleFile(filePath, options = {}) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const wrapped = await wrapMinifiedBundle(raw, options);
    fs.writeFileSync(filePath, wrapped);
}
