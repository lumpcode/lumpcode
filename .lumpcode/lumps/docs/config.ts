import fs from 'node:fs/promises';
import path from 'node:path';

import {
    type CursorPresetLumpVariables,
    type CursorPresetStepVariables,
} from '@lumpcode/cli-utils';
import {
    backlog,
    projectRootFromConfigUrl,
    type BaseBacklogItem,
} from '@lumpcode/recipes';
import { load as loadYaml } from 'js-yaml';

type DocsContextVariables = {
    TASK_NAME: string;
    TASK: string;
    BACKLOG_ITEMS_DIR: string;
    BACKLOG_ITEM_DIR: string;
    BACKLOG_STAGE: 'implementation';
};

const FEATURE_BACKLOG_LUMP = 'backlog';
const FEATURE_BACKLOG_ITEMS_REL = path.join(
    '.lumpcode',
    'lumps',
    FEATURE_BACKLOG_LUMP,
    'backlogItems',
);

async function listItemFolders(dir: string): Promise<string[]> {
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

/**
 * Cross-lump dep on the feature-backlog item with the highest priority
 * (last in that lump's ordering), e.g. `backlog/continue-on-error-default`.
 */
async function highestPriorityFeatureBacklogDep(
    projectRoot: string,
): Promise<string | undefined> {
    const itemsRoot = path.join(projectRoot, FEATURE_BACKLOG_ITEMS_REL);
    const folderNames = [
        ...(await listItemFolders(path.join(itemsRoot, 'todo'))),
        ...(await listItemFolders(path.join(itemsRoot, 'completed'))),
    ];

    let best: { name: string; priority: number } | undefined;

    for (const folderName of folderNames) {
        const todoPath = path.join(itemsRoot, 'todo', folderName, 'desc.yml');
        const completedPath = path.join(itemsRoot, 'completed', folderName, 'desc.yml');
        let rawText: string | undefined;
        try {
            rawText = await fs.readFile(todoPath, 'utf-8');
        } catch {
            try {
                rawText = await fs.readFile(completedPath, 'utf-8');
            } catch {
                continue;
            }
        }

        const raw = loadYaml(rawText);
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
            continue;
        }
        const record = raw as Record<string, unknown>;
        const name = typeof record.name === 'string' ? record.name : folderName;
        const priority = record.priority;
        if (typeof priority !== 'number' || Number.isNaN(priority)) {
            continue;
        }
        if (!best || priority > best.priority) {
            best = { name, priority };
        }
    }

    return best ? `${FEATURE_BACKLOG_LUMP}/${best.name}` : undefined;
}

const configUrl = import.meta.url;
const projectRoot = projectRootFromConfigUrl(configUrl);

export default backlog<BaseBacklogItem, CursorPresetLumpVariables, CursorPresetStepVariables>({
    configUrl,
    baseBranch: 'dev',
    discoveryBranch: 'dev',
    command: 'cursor',
    registerCommands: ['cursor'],
    maximumNumberOfConcurrentBranches: 2,
    disabled: true,
    verbose: true,
    keepHistory: true,
    lumpVariables: { model: 'cursor-grok-4.5-high-fast' },
    async resolveItem() {
        const lastFeatureDep = await highestPriorityFeatureBacklogDep(projectRoot);
        return {
            stage: 'implementation',
            additionalDependsOnContexts: lastFeatureDep ? [lastFeatureDep] : undefined,
        };
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
Update the operator-facing documentation for this docs backlog item.

Backlog item: @${BACKLOG_ITEM_DIR}/desc.yml
Task name: ${TASK_NAME}

Task:
${TASK}

Docs live primarily under packages/apps/cli/DOCS/ (and related READMEs when needed).
Follow existing DOCS style and vocabulary from AGENTS.md / concepts.md:
- Prefer periods/commas over em dashes when not necessary
- Keep docs operator-facing; avoid internal implementation detail unless operators need it
- Cross-cutting topics get one canonical section in concepts.md; other pages link there
- npm-published CLI README doc links use absolute GitHub URLs to packages/apps/cli/DOCS/...

Do not implement product/code features — documentation only.
Do not edit @${BACKLOG_ITEM_DIR}/desc.yml.
                        `.trim();
                    },
                },
            ],
        },
    },
});
