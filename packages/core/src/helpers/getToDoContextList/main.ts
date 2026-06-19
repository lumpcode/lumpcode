import { getCodeBasePaths } from "../getCodeBasePaths";
import { GetContextListFn, Logger, LumpVariables } from "../../types";
import { getContextStatus } from "../getContextStatus";
import { validateContextListNames } from "../validateContextListNames";
import { GitCommitMessageFn } from "../../types/GitCommitMessageFn";
import { failure, success } from "../../utils";

export async function getToDoContextList(params: {
    getContextListFn: GetContextListFn;
    lumpVariables: LumpVariables;
    gitCommitMessageFn: GitCommitMessageFn;
    projectRoot: string;
    baseBranch: string;
    logger?: Logger;
}) {
    const { getContextListFn, lumpVariables, gitCommitMessageFn, projectRoot, baseBranch, logger } = params;

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

    const contextStatusList = await Promise.all(allCtxNamesList.map((contextName) => {
        return getContextStatus({
            contextName: contextName,
            contextVariables: {}, // TODO: Remove contextVariables from getContextStatus, really not needed
            gitCommitMessageFn,
            lumpVariables,
            projectRoot,
            baseBranch,
            logger,
        });
    }));

    const contextStatusMap = new Map(
        allCtxNamesList.map((contextName, i) => [contextName, contextStatusList[i]])
    );

    const contextListToDo = contextList
    .filter((context, contextIndex) => {
        const contextStatus = contextStatusList[contextIndex];
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
