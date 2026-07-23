import type { CodeBasePath, Context, LumpVariables, Maybe, MaybePromise } from "@lumpcode/core";

// testImpl stub: accept <V>; lumpVariables not refined until implementation
export type ContextMatchFn<_V extends LumpVariables = LumpVariables> = (params: {
    codeBasePath: CodeBasePath;
    codeBasePaths: CodeBasePath[];
    lumpVariables: Record<string, unknown>;
}) => MaybePromise<Maybe<{
    contextName: Context['name'],
    filePathVariableName: string,
    moreContextVariables?: Record<string, string>,
    contextOptions?: Maybe<Context['options']>,
}>>;
