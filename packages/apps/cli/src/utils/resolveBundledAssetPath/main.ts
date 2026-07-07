import * as fs from 'node:fs';
import * as path from 'node:path';
import { isSea } from 'node:sea';

/** Resolves a path to CLI-shipped assets (schemas, presets, sidecars) in SEA, ncc bundle, or dev source layouts. */
export function resolveBundledAssetPath(
    callerDir: string,
    bundledRelativePath: string,
    devSourceRelativePath: string,
): string {
    if (isSea()) return path.join(path.dirname(process.execPath), bundledRelativePath);
    const bundled = path.join(callerDir, bundledRelativePath);
    return fs.existsSync(bundled) ? bundled : path.join(callerDir, devSourceRelativePath);
}
