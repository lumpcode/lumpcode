import * as fs from 'node:fs/promises';

import { failure, success } from "@lumpcode/core";

export async function readJson<T>(filePath: string) {
    const fileContent = await fs.readFile(filePath, 'utf8');
    try {
        return success(JSON.parse(fileContent) as T);
    } catch (error) {
        return failure({
            message: `Failed to parse JSON file ${filePath}: ${error}`,
        });
    }
}