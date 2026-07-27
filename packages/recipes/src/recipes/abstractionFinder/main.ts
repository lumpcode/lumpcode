import {
    defineConfig,
    type LumpJsConfig,
    type LumpVariables,
    type StepVariables,
} from '@lumpcode/cli-utils';

import { defineRecipe } from '../../types';

import { ephemeralContextListFn } from '../../kit';

export type AbstractionFinderOptions<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = {
    scanDirectories?: string[];
    customPrompt?(): string;
    maxPendingAbstractions?: number;
    backlogItemsDir: string;
} & LumpJsConfig<V, SV>;

export const abstractionFinder = defineRecipe(function abstractionFinder<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(options: AbstractionFinderOptions<V, SV>): LumpJsConfig<V, SV> {
    const {
        maxPendingAbstractions = 5,
        scanDirectories,
        customPrompt,
        backlogItemsDir,
    } = options; // TODO : check if pending abstcations in backlog are less than maxPendingAbstractions

    return defineConfig<V, SV>({
        ...options,
        getContextListFn: ephemeralContextListFn<V>({
            contextCount: maxPendingAbstractions,
            variables: {
                BACKLOG_ITEMS_DIR: backlogItemsDir,
            },
        }),
        steps: buildFinderPrompt({ backlogItemsDir, scanDirectories, customPrompt }),
    });
});

function buildFinderPrompt({
    backlogItemsDir,
    scanDirectories,
    customPrompt,
}: {
    backlogItemsDir: string;
    scanDirectories?: string[];
    customPrompt?(): string;
}): string {
    return customPrompt ? customPrompt() : `
Scan ${(scanDirectories || []).map((dir) => `@${dir}`).join(' and ') || 'the codebase'} for duplicated logic that appears in multiple places (same pattern, not merely similar file structure).

List existing backlog item names under @${backlogItemsDir}/todo/ and @${backlogItemsDir}/completed/. Do not propose abstractions whose util name already appears in either directory.

Pick exactly one new abstraction that:
- Has a clear util name matching ^[a-zA-Z0-9_-]+$ that describes the pattern it captures.
- Would materialize as a new util under packages/apps/cli/src/utils/<utilName>/.
- Would shrink the codebase: refactoring all call sites in packages/apps/cli should reduce net line count (excluding new unit tests).

Create exactly one new backlog item folder at @${backlogItemsDir}/todo/<utilName>/ with:
- desc.yml containing:
  - name: <utilName> (must match folder name)
  - task: a concise summary of the repeated pattern, proposed util name, and affected areas
  - priority: max existing priority in todo/ plus 1 (or 1 if todo/ is empty)
  - dependsOn: optional list of util names from todo/ or completed/ that must land first (only when clearly needed)
- requirements.md: an implementation-ready requirements document for the same util name. It should be self-contained and include:
  - Problem statement and repeated pattern
  - Goals and non-goals
  - Proposed util API and affected files
  - Acceptance criteria (including net line reduction and unit tests)

Do not implement code. Only create @${backlogItemsDir}/todo/<utilName>/desc.yml and @${backlogItemsDir}/todo/<utilName>/requirements.md.

Do not take too much time looking for every possible abstraction. Once you found a good abstraction, stop and create the backlog item.
    `.trim();
}
