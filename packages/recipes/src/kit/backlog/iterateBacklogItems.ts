import type { BaseBacklogItem } from './types';

export function* iterateBacklogItems<T extends BaseBacklogItem>(doc: T[]) {
    if (!Array.isArray(doc)) {
        throw new Error('BACKLOG.yml must be a flat list of tasks');
    }

    for (const item of doc) {
        if (!item.name) {
            console.error('BACKLOG.yml task missing name');
            continue;
        }

        yield item;
    }
}
