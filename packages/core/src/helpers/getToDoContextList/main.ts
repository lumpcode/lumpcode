import { getCodeBasePaths } from "../getCodeBasePaths";
import { Context, ContextStatus, type Failure, GetContextListFn, Logger, LumpVariables, type Success } from "../../types";
import { getContextStatus } from "../getContextStatus";
import { validateContextListNames } from "../validateContextListNames";
import { GitCommitMessageFn } from "../../types/GitCommitMessageFn";
import { failure, success } from "../../utils";
import {
    refreshRemoteTrackingRefs,
    type RefreshRemoteTrackingRefsFn,
} from "../refreshRemoteTrackingRefs";

export type GetToDoContextListFailure = {
    message: string;
    /** Set when a requested context name cannot be run. */
    code?: 'contextName';
};

export async function getToDoContextList<V extends LumpVariables = LumpVariables>(params: {
    getContextListFn: GetContextListFn<V>;
    lumpVariables: V;
    gitCommitMessageFn: GitCommitMessageFn<V>;
    projectRoot: string;
    baseBranch: string;
    logger?: Logger;
    /**
     * One refresh before status reads. Defaults to unlocked core refresh.
     * CLI injects a git-common-dir-locked wrapper.
     */
    refreshRemoteTrackingRefsFn?: RefreshRemoteTrackingRefsFn;
    /**
     * When set, the result is that one context if it is `toDo` and its
     * `dependsOnContexts` are `finished`. Priority does not apply.
     */
    contextName?: string;
}): Promise<Success<Context[]> | Failure<GetToDoContextListFailure>> {
    const {
        getContextListFn,
        lumpVariables,
        gitCommitMessageFn,
        projectRoot,
        baseBranch,
        logger,
        refreshRemoteTrackingRefsFn = refreshRemoteTrackingRefs,
        contextName,
    } = params;

    const codeBasePathsResult = await getCodeBasePaths({ cwd: projectRoot, logger });

    if (!codeBasePathsResult.success) {
        return failure({
            message: `Failed to get code base paths: ${codeBasePathsResult.data.message}`,
        });
    }

    const codeBasePaths = codeBasePathsResult.data;

    const contextList = await getContextListFn({codeBasePaths, lumpVariables});

    const contextListValidationError = validateContextListNames(contextList);
    if (contextListValidationError) {
        return failure({
            message: contextListValidationError,
        });
    }
    
    const allCtxNames = contextList.flatMap(context => [context.name, ...(context.options?.dependsOnContexts ?? [])]);
    const allCtxNamesSet = new Set(allCtxNames);
    const allCtxNamesList = Array.from(allCtxNamesSet);

    const refreshResult = await refreshRemoteTrackingRefsFn({ projectRoot });
    let contextStatusMap: Map<string, ContextStatus>;

    if (!refreshResult.success) {
        logger?.warn(
            `Failed to refresh remote-tracking refs for context status; treating contexts as toDo: ${refreshResult.data}`,
        );
        contextStatusMap = new Map(allCtxNamesList.map((name) => [name, 'toDo' as const]));
    } else {
        const contextStatusList = await Promise.all(
            allCtxNamesList.map((contextName) =>
                getContextStatus({
                    contextName,
                    contextVariables: {}, // TODO: Remove contextVariables from getContextStatus, really not needed
                    gitCommitMessageFn,
                    lumpVariables,
                    projectRoot,
                    baseBranch,
                    logger,
                    skipFetch: true,
                }),
            ),
        );
        contextStatusMap = new Map(
            allCtxNamesList.map((contextName, i) => [contextName, contextStatusList[i]!]),
        );
    }

    if (contextName !== undefined) {
        const selected = selectNamedContext({ contextName, contextList, contextStatusMap });
        if (!selected.success) return selected;
        logger?.verbose(`contextListToDo ${JSON.stringify(selected.data)}`);
        return selected;
    }

    const contextListToDo = contextList
        .filter((context) => contextIsRunnable(context, contextStatusMap))
        .sort((a, b) => (a.options?.priority || 0) - (b.options?.priority || 0));

    logger?.verbose(`contextListToDo ${JSON.stringify(contextListToDo)}`);

    return success(contextListToDo);
}

function contextIsRunnable(
    context: Context,
    contextStatusMap: Map<string, ContextStatus>,
): boolean {
    const contextStatus = contextStatusMap.get(context.name);
    if (contextStatus && contextStatus !== 'toDo') return false;

    const deps = context.options?.dependsOnContexts;
    if (deps && deps.length > 0) {
        return deps.every((dep) => contextStatusMap.get(dep) === 'finished');
    }

    return true;
}

function selectNamedContext(input: {
    contextName: string;
    contextList: Context[];
    contextStatusMap: Map<string, ContextStatus>;
}): Success<Context[]> | Failure<GetToDoContextListFailure> {
    const { contextName, contextList, contextStatusMap } = input;
    const named = contextList.find((context) => context.name === contextName);
    if (!named) {
        const missing: GetToDoContextListFailure = {
            message: `Context "${contextName}" is not in the context list.`,
            code: 'contextName',
        };
        return failure(missing);
    }

    const status = contextStatusMap.get(contextName);
    if (status && status !== 'toDo') {
        const notToDo: GetToDoContextListFailure = {
            message: `Context "${contextName}" is not toDo (it is ${status}).`,
            code: 'contextName',
        };
        return failure(notToDo);
    }

    const unmet = (named.options?.dependsOnContexts ?? []).filter(
        (dep) => contextStatusMap.get(dep) !== 'finished',
    );
    if (unmet.length > 0) {
        const waiting: GetToDoContextListFailure = {
            message: `Context "${contextName}" is waiting on dependsOnContexts: ${unmet.join(', ')}.`,
            code: 'contextName',
        };
        return failure(waiting);
    }

    return success([named]);
}
