import { getCodeBasePaths } from "../getCodeBasePaths";
import { ContextStatus, GetContextListFn, Logger, LumpVariables } from "../../types";
import { getContextStatus } from "../getContextStatus";
import { validateContextListNames } from "../validateContextListNames";
import { GitCommitMessageFn } from "../../types/GitCommitMessageFn";
import { failure, success } from "../../utils";
import {
    refreshRemoteTrackingRefs,
    type RefreshRemoteTrackingRefsFn,
} from "../refreshRemoteTrackingRefs";

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
}) {
    const {
        getContextListFn,
        lumpVariables,
        gitCommitMessageFn,
        projectRoot,
        baseBranch,
        logger,
        refreshRemoteTrackingRefsFn = refreshRemoteTrackingRefs,
    } = params;

    const codeBasePathsResult = await getCodeBasePaths({ cwd: projectRoot, logger });

    if (!codeBasePathsResult.success) {
        return failure({
            message: 'Failed to get code base paths',
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

    const contextListToDo = contextList
    .filter((context) => {
        const contextStatus = contextStatusMap.get(context.name);
        if (contextStatus && contextStatus !== 'toDo') return false;

        const deps = context.options?.dependsOnContexts;

        if (deps && deps.length > 0) {
            return deps.every(dep => contextStatusMap.get(dep) === 'finished');
        }

        return true;
    })
    .sort((a, b) => {
        return (a.options?.priority || 0) - (b.options?.priority || 0);
    });

    logger?.verbose(`contextListToDo ${JSON.stringify(contextListToDo)}`);

    return success(contextListToDo);
}
