import fs from 'fs/promises';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';
import type {
    Context,
    GetContextListFn,
    LumpVariables,
    MaybePromise,
} from '@lumpcode/cli-utils';
import { pathExists } from '@lumpcode/core';

import type { BaseBacklogItem } from '../../types';
import { validateBaseBacklogItem } from '../validateBaseBacklogItem';

export type FolderBacklogContextsOptions<Item extends BaseBacklogItem = BaseBacklogItem> = {
    backlogItemsDir: string;
    /** When true, umbrella parents with tickets are emitted for wrap-up (featureBacklog). */
    includeUmbrellaParents?: boolean;
    /**
     * `folderName` is the path relative to `todo/`: the item folder, or
     * `<parent>/tickets/<ticket>` when the parent is an umbrella
     * (`tickets/` exists or completed tickets exist).
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

export type ListTodoRelativeDirsOptions = {
    includeUmbrellaParents?: boolean;
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

/** Live and completed ticket folder names for an umbrella parent, sorted uniquely. */
export async function listUmbrellaTicketNames(input: {
    todoDir: string;
    parentName: string;
}): Promise<string[]> {
    const { todoDir, parentName } = input;
    const completedDir = path.join(path.dirname(todoDir), 'completed');
    const liveTicketNames = await listTodoFolderNames(path.join(todoDir, parentName, 'tickets'));
    const completedTicketNames = await listTodoFolderNames(
        path.join(completedDir, parentName, 'tickets'),
    );
    return [...new Set([...liveTicketNames, ...completedTicketNames])].sort();
}

/**
 * Path relative to `todo/`, using `/` so it is stable in context variables.
 * A top-level folder is an umbrella (never itself an item) when it has live
 * tickets, a leftover `tickets/` directory, or tickets already under
 * sibling `completed/<name>/tickets/`.
 */
export async function listTodoRelativeDirs(
    todoDir: string,
    options?: ListTodoRelativeDirsOptions,
): Promise<string[]> {
    const includeUmbrellaParents = options?.includeUmbrellaParents ?? false;
    const topNames = await listTodoFolderNames(todoDir);
    const completedDir = path.join(path.dirname(todoDir), 'completed');
    const relativeDirs: string[] = [];
    for (const name of topNames) {
        const liveTicketsDir = path.join(todoDir, name, 'tickets');
        const liveTicketNames = await listTodoFolderNames(liveTicketsDir);
        const completedTicketNames = await listTodoFolderNames(
            path.join(completedDir, name, 'tickets'),
        );
        const hasAnyTicket = liveTicketNames.length > 0 || completedTicketNames.length > 0;

        if (liveTicketNames.length > 0) {
            for (const ticketName of liveTicketNames) {
                relativeDirs.push(`${name}/tickets/${ticketName}`);
            }
            if (includeUmbrellaParents && hasAnyTicket) {
                relativeDirs.push(name);
            }
            continue;
        }

        const isUmbrella =
            (await pathExists(liveTicketsDir)) || completedTicketNames.length > 0;
        if (isUmbrella) {
            if (includeUmbrellaParents && hasAnyTicket) {
                relativeDirs.push(name);
            }
            continue;
        }
        relativeDirs.push(name);
    }
    return relativeDirs;
}

export function folderBacklogContexts<
    Item extends BaseBacklogItem = BaseBacklogItem,
    V extends LumpVariables = LumpVariables,
>({
    backlogItemsDir,
    includeUmbrellaParents,
    parseItem,
    parseContext,
}: FolderBacklogContextsOptions<Item>): GetContextListFn<V> {
    return async () => {
        const todoDir = path.join(backlogItemsDir, 'todo');
        const folderNames = await listTodoRelativeDirs(todoDir, { includeUmbrellaParents });

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
