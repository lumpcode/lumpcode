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
                'at index 0',
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
            validateBaseBacklogItem({ name: 'bad/name', task: 'x', priority: 1 }, 'at index 0'),
        ).toThrow(/invalid name/);
    });

    it('includes the location string in errors', () => {
        expect(() =>
            validateBaseBacklogItem({ name: 'task', task: 'x' }, 'in folder "alpha"'),
        ).toThrow(/in folder "alpha".*priority/);
    });

    it('rejects non-array dependsOn', () => {
        expect(() =>
            validateBaseBacklogItem(
                { name: 'task', task: 'x', priority: 1, dependsOn: 'other' },
                'at index 0',
            ),
        ).toThrow(/dependsOn.*array/);
    });
});
