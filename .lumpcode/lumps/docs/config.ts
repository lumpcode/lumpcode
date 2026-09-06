import {
    type CursorPresetLumpVariables,
    type CursorPresetStepVariables,
} from '@lumpcode/cli-utils';
import {
    backlog,
    openPrPostTeardown,
    type BaseBacklogItem,
} from '@lumpcode/recipes';

type DocsContextVariables = {
    TASK_NAME: string;
    TASK: string;
    BACKLOG_ITEMS_DIR: string;
    BACKLOG_ITEM_DIR: string;
    BACKLOG_STAGE: 'implementation';
};

export default backlog<BaseBacklogItem, CursorPresetLumpVariables, CursorPresetStepVariables>({
    configUrl: import.meta.url,
    baseBranch: 'dev',
    discoveryBranch: 'dev',
    command: 'cursor',
    registerCommands: ['cursor'],
    maximumNumberOfConcurrentBranches: 2,
    verbose: true,
    keepHistory: true,
    lumpVariables: { model: 'cursor-grok-4.6-high-fast' },
    postTeardownWorkspaceFn: openPrPostTeardown({ provider: 'github' }),
    async resolveItem() {
        return { stage: 'implementation' };
    },
    stages: {
        implementation: {
            completion: 'moveToDone',
            steps: [
                {
                    promptFn({ context: ctx }) {
                        const vars = ctx.variables as DocsContextVariables;
                        const { BACKLOG_ITEM_DIR, TASK_NAME, TASK } = vars;

                        return `
Update the operator-facing docs, website, or naming for this docs backlog item.

Backlog item: @${BACKLOG_ITEM_DIR}/desc.yml
Task name: ${TASK_NAME}

Task:
${TASK}

Surfaces: packages/apps/website/ (landing, /docs, meta titles/descriptions), packages/apps/cli/DOCS/, and related READMEs when needed.
Follow AGENTS.md public website and CLI docs vocabulary.
Do not implement product/code features — documentation, copy, and meta only.
Do not edit @${BACKLOG_ITEM_DIR}/desc.yml.
                        `.trim();
                    },
                },
            ],
        },
    },
});
