import type { CodeBasePath, Context, LumpVariables, Maybe, MaybePromise } from "@lumpcode/core";

export type ContextMatchFn<V extends LumpVariables = LumpVariables> = (params: {
    codeBasePath: CodeBasePath;
    codeBasePaths: CodeBasePath[];
    lumpVariables: V;
    discoveryBranch: string;
}) => MaybePromise<Maybe<{
    contextName: Context['name'],
    filePathVariableName: string,
    moreContextVariables?: Record<string, string>,
    contextOptions?: Maybe<Context['options']>,
}>>;
