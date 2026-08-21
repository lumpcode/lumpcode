import path from 'node:path';

import {
    defineConfig,
    normalizeSteps,
    type CommandFn,
    type LumpJsConfig,
    type LumpJsConfigSteps,
    type LumpVariables,
    type StepVariables,
} from '@lumpcode/cli-utils';
import type { CommandDescriptor } from '@lumpcode/core';

import { defineRecipe } from '../../types';
import {
    ephemeralContextListFn,
    listTodoRelativeDirs,
    projectRootFromConfigUrl,
    shellCommand,
} from '../../kit';

export type AbstractionFinderScanCommand<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = string | CommandDescriptor | CommandFn<V, SV>;

export type AbstractionFinderOptions<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = {
    /** Lump config module URL — pass `import.meta.url` from `config.ts`. */
    configUrl: string | URL;
    scanDirectories?: string[];
    /** Optional util output directory (project-root-relative). Defaults to the first scan directory. */
    utilDir?: string;
    customPrompt?(): string;
    /** Max unmerged items under `backlogItemsDir/todo/`. Finder emits one context per tick while under the cap. */
    maxPendingAbstractions?: number;
    backlogItemsDir: string;
    /** Optional scanner command prepended before the prompt (e.g. a dupes report). */
    scanCommand?: AbstractionFinderScanCommand<V, SV>;
} & Omit<
    LumpJsConfig<V, SV>,
    'contextListJson' | 'contextMatchFn' | 'getContextListFn' | 'prompt'
>;

function scanCommandStep<
    V extends LumpVariables,
    SV extends StepVariables,
>(scanCommand: AbstractionFinderScanCommand<V, SV>): LumpJsConfigSteps<V, SV>[number] {
    if (typeof scanCommand === 'function') {
        return { commandFn: scanCommand };
    }
    if (typeof scanCommand === 'string') {
        return { commandFn: () => shellCommand(scanCommand) };
    }
    return { commandFn: () => scanCommand };
}

export const abstractionFinder = defineRecipe(function abstractionFinder<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(options: AbstractionFinderOptions<V, SV>): LumpJsConfig<V, SV> {
    const {
        configUrl,
        maxPendingAbstractions = 5,
        scanDirectories,
        utilDir,
        customPrompt,
        backlogItemsDir,
        scanCommand,
        steps: stepsOverride,
        ...rest
    } = options;

    if (path.isAbsolute(backlogItemsDir)) {
        throw new Error(`backlogItemsDir must be project-root-relative, not absolute: ${backlogItemsDir}`);
    }

    const projectRoot = projectRootFromConfigUrl(configUrl);
    const todoDir = path.join(projectRoot, backlogItemsDir, 'todo');

    const agentSteps = stepsOverride ?? buildFinderPrompt({
        backlogItemsDir,
        scanDirectories,
        utilDir,
        customPrompt,
    });

    const steps: LumpJsConfigSteps<V, SV> = [
        ...(scanCommand === undefined ? [] : [scanCommandStep<V, SV>(scanCommand)]),
        ...normalizeSteps<V, SV>({
            prompt: undefined,
            jsSteps: agentSteps,
        }),
    ];

    return defineConfig<V, SV>({
        ...rest,
        getContextListFn: ephemeralContextListFn<V>({
            async contextCount() {
                const pending = (await listTodoRelativeDirs(todoDir)).length;
                return pending >= maxPendingAbstractions ? 0 : 1;
            },
            variables: {
                BACKLOG_ITEMS_DIR: backlogItemsDir,
            },
        }),
        steps,
    });
});

function buildFinderPrompt({
    backlogItemsDir,
    scanDirectories,
    utilDir,
    customPrompt,
}: {
    backlogItemsDir: string;
    scanDirectories?: string[];
    utilDir?: string;
    customPrompt?(): string;
}): string {
    if (customPrompt) {
        return customPrompt();
    }

    const scanLabel = scanDirectories && scanDirectories.length > 0
        ? scanDirectories.map((dir) => `@${dir}`).join(' and ')
        : 'the codebase';
    const materializeDir = utilDir ?? scanDirectories?.[0];
    const materializeLine = materializeDir
        ? `- Would materialize as a new util under @${materializeDir}/<utilName>/, following existing conventions there.`
        : '- Would materialize as a new util in the scanned tree, following existing conventions there.';
    const refactorScope = scanDirectories && scanDirectories.length > 0
        ? scanDirectories.join(' and ')
        : 'the scanned tree';

    return `
Scan ${scanLabel} for duplicated logic that appears in multiple places (same pattern, not merely similar file structure).

List existing backlog item names under @${backlogItemsDir}/todo/ and @${backlogItemsDir}/completed/. Do not propose abstractions whose util name already appears in either directory.

Pick exactly one new abstraction that:
- Has a clear util name matching ^[a-zA-Z0-9_-]+$ that describes the pattern it captures.
${materializeLine}
- Would shrink the codebase: refactoring all call sites in ${refactorScope} should reduce net line count (excluding new unit tests).

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
