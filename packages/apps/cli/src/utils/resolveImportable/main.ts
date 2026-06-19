import * as path from 'node:path';
import { isSea } from 'node:sea';
import { pathToFileURL } from 'node:url';

import { Failure, failure, Maybe, success, Success } from "@lumpcode/core";
import { isTypeScriptModulePath, transpileTypeScriptToCachedMjs } from '../transpileTypeScriptToCachedMjs';

/** ncc bundle: native `import(url)` for arbitrary file URLs often fails; indirect import still works. */
const dynamicImportForBundle = new Function('p', 'return import(p)') as (specifier: string) => Promise<unknown>;

async function importModuleFile(absolutePath: string): Promise<Record<string, unknown>> {
    const fileUrl = pathToFileURL(absolutePath).href;
    // Vitest workers: indirect `import` hits ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING — use real import().
    if (process.env.VITEST) {
        return (await import(fileUrl)) as Record<string, unknown>;
    }
    // Windows ESM requires file:// URLs; Unix SEA accepts absolute paths.
    const specifier =
        process.platform === 'win32' || !isSea() ? fileUrl : absolutePath;
    return (await dynamicImportForBundle(specifier)) as Record<string, unknown>;
}

export async function resolveImportable<T>(
    value: string,
    key: Maybe<string> = 'default',
    options?: { importBasePath?: string },
): Promise<Success<T> | Failure<string>> {
    try {
        const absolutePath = options?.importBasePath
            ? path.resolve(options.importBasePath, value)
            : path.resolve(value);

        let importPath = absolutePath;
        if (isTypeScriptModulePath(absolutePath)) {
            const transpileResult = await transpileTypeScriptToCachedMjs(absolutePath);
            if (!transpileResult.success) return transpileResult;
            importPath = transpileResult.data;
        }

        const mod = await importModuleFile(importPath);
        const resolved = key ? mod[key] : mod;
        return success(resolved as T);
    }
    catch (error) {
        return failure(`Failed to import ${value}, error: ${error}`);
    }
}
