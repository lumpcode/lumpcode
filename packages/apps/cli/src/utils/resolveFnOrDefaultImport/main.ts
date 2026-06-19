import { Failure, success, Success } from "@lumpcode/core";
import { resolveImportable } from "../resolveImportable";

export async function resolveFnOrDefaultImport<T extends Function>(
    value: T | string,
    options?: { importBasePath?: string },
): Promise<Success<T> | Failure<string>> {
    if (typeof value === 'function') return success(value);
    return resolveImportable<T>(value, 'default', options);
};