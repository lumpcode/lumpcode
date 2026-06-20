import { failure, Failure, Success } from '@lumpcode/core';

export function isTypeScriptModulePath(filePath: string): boolean {
    return filePath.endsWith('.ts');
}

export async function transpileTypeScriptToCachedMjs(
    _sourceAbsolutePath: string,
): Promise<Success<string> | Failure<string>> {
    return failure('not implemented');
}
