import { defineConfig, LumpJsConfig } from '@lumpcode/cli-types';

import { defineRecipe, type Recipe } from '../../types';

import { ephemeralContextListFn } from '../../kit';

export type AbstractionFinderOptions = {
    scanDirectories: string[];
    customPrompt?(): string;
    maxPendingAbstractions?: number;
    backlogFilePath: string;
    doneFilePath?: string;
    prdDirPath?: string;
} & LumpJsConfig;


export const abstractionFinder: Recipe<AbstractionFinderOptions> = defineRecipe((options) => {
    const {
        maxPendingAbstractions = 5,
        scanDirectories,
        customPrompt,
        backlogFilePath,
        prdDirPath,
        doneFilePath,
    } = options;

    return defineConfig({
        ...options,
        getContextListFn: ephemeralContextListFn({
            contextCount: maxPendingAbstractions,
            variables: {
                PRD_DIR_PATH: prdDirPath ?? '',
                BACKLOG_FILE_PATH: backlogFilePath ?? '',
                DONE_FILE_PATH: doneFilePath ?? '',
            },
        }),
        steps: buildFinderPrompt({ prdDirPath, backlogFilePath, doneFilePath, scanDirectories, customPrompt }),
    });
});


function buildFinderPrompt({
    prdDirPath,
    backlogFilePath,
    doneFilePath,
    scanDirectories,
    customPrompt,
}: {
    prdDirPath?: string;
    backlogFilePath?: string;
    doneFilePath?: string;
    scanDirectories?: string[];
    customPrompt?(): string;
}): string {

    return customPrompt ? customPrompt() : `
Scan ${(scanDirectories || []).map((dir) => `@${dir}`).join(' and ') || 'the codebase'} for duplicated logic that appears in multiple places (same pattern, not merely similar file structure).

Read @${backlogFilePath} and @${doneFilePath}. Do not propose abstractions whose util name already appears in either file.

Pick exactly one new abstraction that:
- Has a clear util name matching ^[a-zA-Z0-9_-]+$ that describes the pattern it captures.
- Would materialize as a new util under packages/apps/cli/src/utils/<utilName>/.
- Would shrink the codebase: refactoring all call sites in packages/apps/cli should reduce net line count (excluding new unit tests).

Add exactly one entry to @${backlogFilePath} with:
- task: a concise summary of the repeated pattern, proposed util name, and affected areas
- priority: max existing priority in BACKLOG.yml plus 1 (or 1 if the backlog is empty)
- dependsOn: optional list of util names from BACKLOG.yml or DONE.yml that must land first (only when clearly needed)

Write an implementation-ready PRD to @${prdDirPath}/<utilName>.prd.md for the same util name. The PRD should be self-contained and include:
- Problem statement and repeated pattern
- Goals and non-goals
- Proposed util API and affected files
- Acceptance criteria (including net line reduction and unit tests)

Do not implement code. Only edit @${backlogFilePath} (append one item) and create the PRD file.
    `.trim();
}