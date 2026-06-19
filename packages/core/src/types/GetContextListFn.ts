import { CodeBasePath } from "./CodeBasePath";
import { ContextList } from "./ContextList";
import { LumpVariables } from "./LumpVariables";
import { MaybePromise } from "./MaybePromise";

export interface GetContextListFnInput {
    codeBasePaths: CodeBasePath[];
    lumpVariables: LumpVariables;
}

export type GetContextListFnOutput = MaybePromise<ContextList>;

export type GetContextListFn = (params: GetContextListFnInput) => GetContextListFnOutput;