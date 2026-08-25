import type { LumpVariables, MaybePromise } from '@lumpcode/core';

import type { PostSetupWorkspaceFnInput } from './PostSetupWorkspaceFnInput';

export type PostTeardownWorkspaceFn<V extends LumpVariables = LumpVariables> = (
    input: PostSetupWorkspaceFnInput<V>,
) => MaybePromise<{ command?: string } | void>;
