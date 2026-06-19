import type { CodeBasePath, Context, Maybe, MaybePromise } from "@lumpcode/core";

export type ContextMatchFn = (params: {
    codeBasePath: CodeBasePath;
    codeBasePaths: CodeBasePath[];
    lumpVariables: Record<string, unknown>;
}) => MaybePromise<Maybe<{
    contextName: Context['name'],
    filePathVariableName: string,
    moreContextVariables?: Record<string, string>,
    contextOptions?: Maybe<Context['options']>,
}>>;