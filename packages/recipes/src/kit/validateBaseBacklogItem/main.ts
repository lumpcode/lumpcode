import type { BaseBacklogItem } from '../../types';

const CONTEXT_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

function assertRecord(value: unknown, location: string): asserts value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`Backlog item ${location} must be an object`);
    }
}

function assertStringField(
    record: Record<string, unknown>,
    field: string,
    location: string,
): asserts record is Record<string, unknown> & Record<typeof field, string> {
    const value = record[field];
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`Backlog item ${location} requires non-empty string field "${field}"`);
    }
}

function assertNumberField(
    record: Record<string, unknown>,
    field: string,
    location: string,
): asserts record is Record<string, unknown> & Record<typeof field, number> {
    const value = record[field];
    if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new Error(`Backlog item ${location} requires numeric field "${field}"`);
    }
}

/** Validates and normalizes one backlog item; throws on invalid input. */
export function validateBaseBacklogItem(raw: unknown, location: string): BaseBacklogItem {
    assertRecord(raw, location);
    assertStringField(raw, 'name', location);
    assertStringField(raw, 'task', location);
    assertNumberField(raw, 'priority', location);

    if (!CONTEXT_NAME_PATTERN.test(raw.name)) {
        throw new Error(
            `Backlog item ${location} has invalid name "${raw.name}" (expected ^[a-zA-Z0-9_-]+$)`,
        );
    }

    let dependsOn: string[] | undefined;
    if (raw.dependsOn !== undefined) {
        if (!Array.isArray(raw.dependsOn)) {
            throw new Error(`Backlog item ${location} field "dependsOn" must be an array`);
        }
        for (const dep of raw.dependsOn as unknown[]) {
            if (typeof dep !== 'string' || dep.trim() === '') {
                throw new Error(
                    `Backlog item ${location} field "dependsOn" must contain non-empty strings`,
                );
            }
        }
        dependsOn = raw.dependsOn as string[];
    }

    return {
        ...raw,
        name: raw.name,
        task: raw.task,
        priority: raw.priority,
        dependsOn,
    };
}
