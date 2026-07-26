import { CodeBasePath } from "./CodeBasePath";
import { ContextList } from "./ContextList";
import { LumpVariables } from "./LumpVariables";
import { MaybePromise } from "./MaybePromise";

export interface GetContextListFnInput<V extends LumpVariables = LumpVariables> {
    codeBasePaths: CodeBasePath[];
    lumpVariables: V;
}

export type GetContextListFnOutput = MaybePromise<ContextList>;

export type GetContextListFn<V extends LumpVariables = LumpVariables> = (
    params: GetContextListFnInput<V>,
) => GetContextListFnOutput;
