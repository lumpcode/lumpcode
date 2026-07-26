import type {
    GetContextListFn,
    GetContextListFnInput,
    LumpVariables,
} from '@lumpcode/cli-utils';
import { MaybePromGetter, normalizeMaybePromGetter } from '../types/MaybePromGetter';

type ContextVariables = Record<string, string | number | boolean>;

export type EphemeralContextListFnOptions<V extends LumpVariables = LumpVariables> = {
    contextCount?: MaybePromGetter<number, GetContextListFnInput<V>>;
    contextName?: MaybePromGetter<string, { index: number, count: number }>;
    variables?: MaybePromGetter<ContextVariables, { contextName: string, index: number, count: number }>;
};

async function resolveContextName<V extends LumpVariables>(
    index: number,
    count: number,
    contextName: EphemeralContextListFnOptions<V>['contextName'],
): Promise<string> {
    return normalizeMaybePromGetter(
        contextName,
        (new Date()).toISOString().slice(0, 23).replace(/:/g, '').replace('.', '-'),
    )({
        index,
        count,
    });
}

export function ephemeralContextListFn<V extends LumpVariables = LumpVariables>(
    options: EphemeralContextListFnOptions<V> = {},
): GetContextListFn<V> {
    return async (input) => {
        const count = await (normalizeMaybePromGetter(options.contextCount, 1)(input));

        if (count <= 0) {
            return [];
        }

        const contextNamesSet = new Set<string>();

        return Promise.all(
            Array.from({ length: count }, async (_, index) => {
                let name = await resolveContextName(index, count, options.contextName);

                if (contextNamesSet.has(name)) {
                    name = `${name}-${index}`;
                }
                contextNamesSet.add(name);

                const variables = await (normalizeMaybePromGetter(options.variables, {})({
                    contextName: name,
                    index,
                    count,
                }));

                return {
                    name,
                    variables,
                };
            }),
        );
    };
}
