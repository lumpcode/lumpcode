import { describe, expect, it } from 'vitest';

import { validateBaseBacklogItem } from './main';

describe('validateBaseBacklogItem', () => {
    it('accepts a valid backlog item', () => {
        expect(
            validateBaseBacklogItem(
                {
                    name: 'my-task',
                    task: 'Do the thing',
                    priority: 1,
                    dependsOn: ['other-task'],
                },
                0,
            ),
        ).toEqual({
            name: 'my-task',
            task: 'Do the thing',
            priority: 1,
            dependsOn: ['other-task'],
        });
    });

    it('rejects invalid names', () => {
        expect(() =>
            validateBaseBacklogItem({ name: 'bad/name', task: 'x', priority: 1 }, 0),
        ).toThrow(/invalid name/);
    });

    it('rejects missing priority', () => {
        expect(() =>
            validateBaseBacklogItem({ name: 'task', task: 'x' }, 2),
        ).toThrow(/index 2.*priority/);
    });

    it('rejects non-array dependsOn', () => {
        expect(() =>
            validateBaseBacklogItem(
                { name: 'task', task: 'x', priority: 1, dependsOn: 'other' },
                0,
            ),
        ).toThrow(/dependsOn.*array/);
    });
});
