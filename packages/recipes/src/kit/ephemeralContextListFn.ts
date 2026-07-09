import type { Context, GetContextListFn, GetContextListFnInput, MaybePromise } from '@lumpcode/cli-types';

type ContextVariables = Record<string, string | number | boolean>;

export type ContextCountFn = (input: GetContextListFnInput) => MaybePromise<number>;

export type EphemeralContextListFnOptions = {
    /** Defaults to `1`. When a function, pair with `maxContextCount` on {@link ephemeralContextLump}. */
    contextCount?: number | ContextCountFn;
    /**
     * Defaults to `isoContextName()` + `-${index}`.
     * Plain strings auto-suffix `-{index}` when `contextCount` > 1.
     */
    contextName?: string | (() => MaybePromise<string>) | ((index: number) => MaybePromise<string>);
    variables?: ContextVariables | ((contextName: string, index: number) => MaybePromise<ContextVariables>);
};

/** ISO-8601 datetime to the second with colons replaced for valid Lumpcode context names. */
export function isoContextName(date = new Date()): string {
    return date.toISOString().slice(0, 19).replace(/:/g, '-');
}

export async function resolveContextCount(
    contextCount: number | ContextCountFn | undefined,
    input: GetContextListFnInput,
): Promise<number> {
    if (contextCount === undefined) {
        return 1;
    }
    if (typeof contextCount === 'number') {
        return contextCount;
    }
    return contextCount(input);
}

async function resolveContextName(
    index: number,
    count: number,
    contextName: EphemeralContextListFnOptions['contextName'],
): Promise<string> {
    if (contextName === undefined) {
        return `${isoContextName()}-${index}`;
    }

    if (typeof contextName === 'string') {
        return count > 1 ? `${contextName}-${index}` : contextName;
    }

    if (contextName.length === 0) {
        const zeroArgContextName = contextName as () => MaybePromise<string>;
        const name = await zeroArgContextName();
        return count > 1 ? `${name}-${index}` : name;
    }

    const indexContextName = contextName as (index: number) => MaybePromise<string>;
    return indexContextName(index);
}

async function resolveContextVariables(
    contextName: string,
    index: number,
    variables: EphemeralContextListFnOptions['variables'],
): Promise<ContextVariables> {
    if (variables === undefined) {
        return {};
    }
    if (typeof variables === 'function') {
        return variables(contextName, index);
    }
    return variables;
}

/** Synthetic ephemeral contexts per invocation — count, names, and variables configurable. */
export function ephemeralContextListFn(
    options: EphemeralContextListFnOptions = {},
): GetContextListFn {
    return async (input) => {
        const count = await resolveContextCount(options.contextCount, input);

        if (count <= 0) {
            return [];
        }

        const contexts: Context[] = [];

        for (let index = 0; index < count; index += 1) {
            const name = await resolveContextName(index, count, options.contextName);
            const variables = await resolveContextVariables(name, index, options.variables);

            contexts.push({
                name,
                variables,
            });
        }

        return contexts;
    };
}
