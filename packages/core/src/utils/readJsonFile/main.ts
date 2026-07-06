import * as fs from 'node:fs/promises';

import type { Failure, Success } from '../../types';
import { failure } from '../failure';
import { nodeErrnoCode } from '../nodeErrnoCode';
import { success } from '../success';

export type ReadJsonFileIfMissing<T> = 'fail' | 'undefined' | { defaultValue: T };

type ReadJsonFileBaseInput = {
    filePath: string;
    missingFileFailure?: string;
};

export async function readJsonFile<T>(
    input: ReadJsonFileBaseInput & { ifMissing: 'undefined' },
): Promise<Success<T | undefined> | Failure<string>>;
export async function readJsonFile<T>(
    input: ReadJsonFileBaseInput & { ifMissing: { defaultValue: T } },
): Promise<Success<T> | Failure<string>>;
export async function readJsonFile<T>(
    input: ReadJsonFileBaseInput & { ifMissing?: 'fail' },
): Promise<Success<T> | Failure<string>>;
export async function readJsonFile<T = unknown>(
    input: ReadJsonFileBaseInput & { ifMissing?: ReadJsonFileIfMissing<T> },
): Promise<Success<T | undefined> | Failure<string>> {
    const { filePath, ifMissing = 'fail', missingFileFailure } = input;

    let raw: string;
    try {
        raw = await fs.readFile(filePath, 'utf8');
    } catch (error: unknown) {
        const code = nodeErrnoCode(error);
        if (code === 'ENOENT') {
            if (ifMissing === 'undefined') {
                return success(undefined);
            }
            if (typeof ifMissing === 'object') {
                return success(ifMissing.defaultValue);
            }
            return failure(missingFileFailure ?? `File not found: ${filePath}`);
        }
        return failure(`Cannot read ${filePath}: ${String(error)}`);
    }

    try {
        return success(JSON.parse(raw) as T);
    } catch (error) {
        return failure(`Invalid JSON in ${filePath}: ${String(error)}`);
    }
}
