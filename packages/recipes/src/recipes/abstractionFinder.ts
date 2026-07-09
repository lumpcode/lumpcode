import { defineConfig } from '@lumpcode/cli-types';
import { shellSingleQuote } from '@lumpcode/core';

import {
    FINDER_BACKLOG_BASELINE_KEY,
    makeAbstractionFinderContextCount,
    recordFinderBacklogBaselineStep,
    validateAbstractionFinderOutput,
    type FinderBacklogBaseline,
} from '../kit/abstractionFinder';
import { backlogPaths } from '../kit/backlog';
import { defineRecipe, type Recipe } from '../types/recipe';
import { ephemeralContextLump, type EphemeralContextLumpOptions } from './ephemeralContextLump';

export type AbstractionFinderOptions = {
    /** Lump that owns BACKLOG.yml / prds/ (default `abstractionImplementer`). */
    implementerLumpName?: string;
    /** Directories to scan for duplicated logic. */
    scanDirectories: string[];
    /** Custom prompt to use instead of the default. */
    customPrompt?(implementerLumpName: string, scanDirectories: string[]): string;
    /** Target pending queue depth (default 5). */
    maxPendingAbstractions?: number;
} & Omit<
    EphemeralContextLumpOptions,
    | 'validateCommand'
    | 'getContextListFn'
    | 'contextName'
    | 'variables'
    | 'prompt'
    | 'fixPrompt'
    | 'contextCount'
    | 'maxContextCount'
    | 'numberOfContextsPerBranch'
>;

function buildFinderPrompt({
    implementerLumpName,
    scanDirectories,
    customPrompt,
}: {
    implementerLumpName: string;
    scanDirectories: string[];
    customPrompt?: (implementerLumpName: string, scanDirectories: string[]) => string;
}): string {
    const { backlogPath, donePath, prdDir } = backlogPaths(implementerLumpName);

    return customPrompt ? customPrompt(implementerLumpName, scanDirectories) : `
Scan ${scanDirectories.map((dir) => `@${dir}`).join(' and ') || 'the codebase'} for duplicated logic that appears in multiple places (same pattern, not merely similar file structure).

Read @${backlogPath} and @${donePath}. Do not propose abstractions whose util name already appears in either file.

Pick exactly one new abstraction that:
- Has a clear util name matching ^[a-zA-Z0-9_-]+$ that describes the pattern it captures.
- Would materialize as a new util under packages/apps/cli/src/utils/<utilName>/.
- Would shrink the codebase: refactoring all call sites in packages/apps/cli should reduce net line count (excluding new unit tests).

Add exactly one entry to @${backlogPath} with:
- task: a concise summary of the repeated pattern, proposed util name, and affected areas
- priority: max existing priority in BACKLOG.yml plus 1 (or 1 if the backlog is empty)
- dependsOn: optional list of util names from BACKLOG.yml or DONE.yml that must land first (only when clearly needed)

Write an implementation-ready PRD to @${prdDir}/<utilName>.prd.md for the same util name. The PRD should be self-contained and include:
- Problem statement and repeated pattern
- Goals and non-goals
- Proposed util API and affected files
- Acceptance criteria (including net line reduction and unit tests)

Do not implement code. Only edit @${backlogPath} (append one item) and create the PRD file.
    `.trim();
}

function buildFinderFixPrompt({
    prevValidateCommandResult,
    implementerLumpName,
}: {
    prevValidateCommandResult: string | null;
    implementerLumpName: string;
}): string {
    const { backlogPath, prdDir } = backlogPaths(implementerLumpName);

    return `
The finder output validation failed. Fix @${backlogPath} and/or the PRD under @${prdDir}/ so validation passes.

You must still add exactly one new backlog item and exactly one matching PRD file.

Validation errors:

${prevValidateCommandResult ?? '(no output captured)'}
    `.trim();
}

/**
 * Discovers CLI abstractions and appends backlog items + PRDs to abstractionImplementer when the queue has room.
 * Emits one ephemeral context per open slot, grouped on one branch/PR per tick.
 */
export const abstractionFinder: Recipe<AbstractionFinderOptions> = defineRecipe((options) => {
    const {
        implementerLumpName = 'abstractionImplementer',
        maxPendingAbstractions = 5,
        maxIterations = 3,
        command = 'cursor',
        lumpVariables = { model: 'composer-2.5' },
        registerCommands = ['cursor'],
        maximumNumberOfConcurrentBranches = 1,
        verbose = true,
        keepHistory = true,
        scanDirectories,
        customPrompt,
        isValidationCommandResultOk,
        ...rest
    } = options;

    const lumpConfig = ephemeralContextLump({
        command,
        lumpVariables,
        registerCommands,
        maximumNumberOfConcurrentBranches,
        verbose,
        keepHistory,
        maxIterations,
        isValidationCommandResultOk,
        contextCount: makeAbstractionFinderContextCount({
            implementerLumpName,
            maxPendingAbstractions,
        }),
        variables: () => ({
            IMPLEMENTER_LUMP_NAME: implementerLumpName,
            MAX_PENDING_ABSTRACTIONS: maxPendingAbstractions,
        }),
        prompt: buildFinderPrompt({ implementerLumpName, scanDirectories, customPrompt }),
        fixPrompt: ({ prevValidateCommandResult }) =>
            buildFinderFixPrompt({ prevValidateCommandResult, implementerLumpName }),
        validateCommand: async ({ contextRunState, workspacePath }) => {
            const baseline = contextRunState[FINDER_BACKLOG_BASELINE_KEY] as
                | FinderBacklogBaseline
                | undefined;

            if (!baseline) {
                return {
                    executable: 'sh',
                    args: ['-c', 'echo "Missing backlog baseline." && exit 1'],
                };
            }

            const result = await validateAbstractionFinderOutput({
                workspacePath,
                implementerLumpName,
                baseline,
            });

            const shellBody = result.ok
                ? `echo ${shellSingleQuote(result.message)}`
                : `echo ${shellSingleQuote(result.message)} && exit 1`;

            return {
                executable: 'sh',
                args: ['-c', shellBody],
            };
        },
        ...rest,
    });

    const lumpSteps = lumpConfig.steps ?? [];

    return defineConfig({
        ...lumpConfig,
        steps: [recordFinderBacklogBaselineStep({ implementerLumpName }), ...lumpSteps],
    });
});
