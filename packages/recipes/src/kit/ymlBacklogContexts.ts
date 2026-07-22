import fs from 'fs/promises';
import { load as loadYaml } from 'js-yaml';
import type { Context, GetContextListFn, MaybePromise } from '@lumpcode/cli-utils';

import type { BaseBacklogItem } from '../types';
import { validateBaseBacklogItem } from './validateBaseBacklogItem';

let ymlBacklogDeprecatedWarned = false;

function warnYmlBacklogDeprecated(): void {
    if (ymlBacklogDeprecatedWarned) {
        return;
    }
    ymlBacklogDeprecatedWarned = true;
    console.warn(
        '[lumpcode/recipes] ymlBacklogContexts is deprecated; use folderBacklogContexts. ' +
            'YAML backlog helpers will be removed in a future major version.',
    );
}

export type YmlBacklogContextsOptions<Item extends BaseBacklogItem = BaseBacklogItem> = {
    backlogFilePath: string;
    parseItem?: (item: BaseBacklogItem, index: number, raw: unknown) => Item;
    parseContext?: (
        item: Item,
        index: number,
    ) => MaybePromise<{
        parsed?: Partial<Context>;
        ignored?: boolean;
    }>;
};

export function ymlBacklogContexts<Item extends BaseBacklogItem = BaseBacklogItem>({
    backlogFilePath,
    parseItem,
    parseContext,
}: YmlBacklogContextsOptions<Item>): GetContextListFn {
    return async () => {
        warnYmlBacklogDeprecated();
        const raw = await fs.readFile(backlogFilePath, 'utf-8');
        const doc = loadYaml(raw);

        if (!Array.isArray(doc)) {
            throw new Error(`Backlog file ${backlogFilePath} must contain a YAML list`);
        }

        const allCtxs = await Promise.all(
            doc.map(async (rawItem, index): Promise<Context | null> => {
                const baseItem = validateBaseBacklogItem(rawItem, `at index ${index}`);
                const item = parseItem ? parseItem(baseItem, index, rawItem) : (baseItem as Item);

                const { parsed, ignored } = parseContext
                    ? await parseContext(item, index)
                    : { parsed: undefined, ignored: false };

                if (ignored) return null;

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
