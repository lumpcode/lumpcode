import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { Failure, Success } from '../../types';
import { failure } from '../failure';
import { nodeErrnoCode } from '../nodeErrnoCode';
import { success } from '../success';

export async function appendMissingGitignoreLines(input: {
    projectRoot: string;
    lines: readonly string[];
}): Promise<Success<void> | Failure<string>> {
    const gitignorePath = path.join(input.projectRoot, '.gitignore');
    let content = '';
    try {
        content = await fs.readFile(gitignorePath, 'utf-8');
    } catch (error: unknown) {
        if (nodeErrnoCode(error) !== 'ENOENT') {
            return failure(`Cannot read .gitignore: ${String(error)}`);
        }
    }

    const existingLines = new Set(content.split(/\r?\n/).map((line) => line.trim()));
    const missing = input.lines.filter((line) => !existingLines.has(line));
    if (missing.length === 0) return success(undefined);

    const prefix = content.length === 0 ? '' : content.endsWith('\n') ? '' : '\n';
    try {
        await fs.appendFile(gitignorePath, `${prefix}${missing.join('\n')}\n`, 'utf-8');
    } catch (error: unknown) {
        return failure(`Cannot update .gitignore: ${String(error)}`);
    }
    return success(undefined);
}
