import { Context, Maybe, MaybePromise } from "@lumpcode/core";

export type ContextOptionsFn = (contextWithoutOptions: Omit<Context, 'options'>) => MaybePromise<Maybe<Context['options']>>;