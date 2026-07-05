import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { failure, success, type Failure, type Success } from '@lumpcode/core';

import { isPromptTemplateFileRef } from '../lumpConfigPathRef';

export async function resolvePromptTemplateString({
    value,
    importBasePath,
}: {
    value: string;
    importBasePath: string;
}): Promise<Success<string> | Failure<string>> {
    if (!isPromptTemplateFileRef(value)) {
        return success(value);
    }

    const absolutePath = path.resolve(importBasePath, value);
    try {
        await fs.access(absolutePath);
    } catch {
        return failure(`Prompt template file not found: ${value}`);
    }

    try {
        const contents = await fs.readFile(absolutePath, 'utf8');
        return success(contents.trimEnd());
    } catch (error) {
        return failure(`Failed to read prompt template file '${value}': ${error}`);
    }
}
