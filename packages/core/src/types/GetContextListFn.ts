import { CodeBasePath } from "./CodeBasePath";
import { ContextList } from "./ContextList";
import { LumpVariables } from "./LumpVariables";
import { MaybePromise } from "./MaybePromise";

// testImpl stub: accept <V>; lumpVariables not refined until implementation
export interface GetContextListFnInput<_V extends LumpVariables = LumpVariables> {
    codeBasePaths: CodeBasePath[];
    lumpVariables: LumpVariables;
}

export type GetContextListFnOutput = MaybePromise<ContextList>;

export type GetContextListFn<_V extends LumpVariables = LumpVariables> = (
    params: GetContextListFnInput,
) => GetContextListFnOutput;
