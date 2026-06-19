import type { MaybePromise } from '@lumpcode/core';
import { failure, type Failure, success, type Success } from '@lumpcode/core';

import type { LumpJsConfig } from '../../types';
import { resolveFnOrDefaultImport } from '../resolveFnOrDefaultImport';

export async function resolveLumpDisabled(
    disabled: LumpJsConfig['disabled'] | undefined,
    options?: { importBasePath?: string },
): Promise<Success<{ disabled: boolean }> | Failure<string>> {
    if (disabled === undefined || disabled === false) {
        return success({ disabled: false });
    }
    if (disabled === true) {
        return success({ disabled: true });
    }
    const resolvedResult = await resolveFnOrDefaultImport<() => MaybePromise<boolean>>(disabled, options);
    if (!resolvedResult.success) return resolvedResult;
    const value = await resolvedResult.data();
    return success({ disabled: Boolean(value) });
}
