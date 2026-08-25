import fs from 'fs/promises';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';
import type {
    Context,
    GetContextListFn,
    LumpVariables,
    MaybePromise,
} from '@lumpcode/cli-utils';

import type { BaseBacklogItem } from '../../types';
import { validateBaseBacklogItem } from '../validateBaseBacklogItem';

export type FolderBacklogContextsOptions<Item extends BaseBacklogItem = BaseBacklogItem> = {
    backlogItemsDir: string;
    /**
     * `folderName` is the path relative to `todo/`: the item folder, or
     * `<parent>/tickets/<ticket>` when the parent has a `tickets/` directory.
     */
    parseItem?: (item: BaseBacklogItem, folderName: string, raw: unknown) => Item;
    parseContext?: (
        item: Item,
        folderName: string,
    ) => MaybePromise<{
        parsed?: Partial<Context>;
        ignored?: boolean;
    }>;
};

async function listTodoFolderNames(todoDir: string): Promise<string[]> {
    try {
        const entries = await fs.readdir(todoDir, { withFileTypes: true });
        return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

/** Path relative to `todo/`, using `/` so it is stable in context variables. */
export async function listTodoRelativeDirs(todoDir: string): Promise<string[]> {
    const topNames = await listTodoFolderNames(todoDir);
    const relativeDirs: string[] = [];
    for (const name of topNames) {
        const ticketNames = await listTodoFolderNames(path.join(todoDir, name, 'tickets'));
        if (ticketNames.length === 0) {
            relativeDirs.push(name);
            continue;
        }
        for (const ticketName of ticketNames) {
            relativeDirs.push(`${name}/tickets/${ticketName}`);
        }
    }
    return relativeDirs;
}

export function folderBacklogContexts<
    Item extends BaseBacklogItem = BaseBacklogItem,
    V extends LumpVariables = LumpVariables,
>({
    backlogItemsDir,
    parseItem,
    parseContext,
}: FolderBacklogContextsOptions<Item>): GetContextListFn<V> {
    return async () => {
        const todoDir = path.join(backlogItemsDir, 'todo');
        const folderNames = await listTodoRelativeDirs(todoDir);

        const discovered = await Promise.all(
            folderNames.map(async (folderName) => {
                const descPath = path.join(todoDir, folderName, 'desc.yml');
                let rawText: string;
                try {
                    rawText = await fs.readFile(descPath, 'utf-8');
                } catch (error) {
                    const err = error as NodeJS.ErrnoException;
                    if (err.code === 'ENOENT') {
                        throw new Error(
                            `Backlog item folder "${folderName}" is missing desc.yml at ${descPath}`,
                        );
                    }
                    throw error;
                }

                const raw = loadYaml(rawText);
                const itemFolderName = path.basename(folderName);
                const baseItem = validateBaseBacklogItem(raw, `in folder "${folderName}"`);
                if (baseItem.name !== itemFolderName) {
                    throw new Error(
                        `Backlog item folder "${folderName}" desc.yml name "${baseItem.name}" must match folder name`,
                    );
                }

                const item = parseItem ? parseItem(baseItem, folderName, raw) : (baseItem as Item);
                return { item, folderName };
            }),
        );

        const seenNames = new Map<string, string>();
        for (const { item, folderName } of discovered) {
            const previous = seenNames.get(item.name);
            if (previous !== undefined) {
                throw new Error(
                    `Duplicate backlog item name "${item.name}" in folders "${previous}" and "${folderName}"`,
                );
            }
            seenNames.set(item.name, folderName);
        }

        discovered.sort((a, b) => {
            if (a.item.priority !== b.item.priority) {
                return a.item.priority - b.item.priority;
            }
            return a.item.name.localeCompare(b.item.name);
        });

        const allCtxs = await Promise.all(
            discovered.map(async ({ item, folderName }): Promise<Context | null> => {
                const { parsed, ignored } = parseContext
                    ? await parseContext(item, folderName)
                    : { parsed: undefined, ignored: false };

                if (ignored) {
                    return null;
                }

                return {
                    name: item.name,
                    options: {
                        priority: item.priority,
                        dependsOnContexts: item.dependsOn,
                    },
                    variables: parsed?.variables ?? {},
                    ...parsed,
                };
            }),
        );

        return allCtxs.filter((ctx): ctx is Context => !!ctx);
    };
}
