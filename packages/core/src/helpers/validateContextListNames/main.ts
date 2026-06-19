import { Context } from "../../types";

const VALID_CONTEXT_NAME = /^[a-zA-Z0-9_-]+$/;

export function validateContextListNames(contextList: Context[]): string | undefined {
    const invalidNames = contextList
        .filter((context) => !VALID_CONTEXT_NAME.test(context.name))
        .map((context) => context.name);

    if (invalidNames.length > 0) {
        return `Invalid context name(s): ${invalidNames.join(', ')}. Context names must contain only letters, digits, underscores (_), and hyphens (-).`;
    }

    const seen = new Set<string>();
    const duplicateNames: string[] = [];

    for (const context of contextList) {
        if (seen.has(context.name)) {
            if (!duplicateNames.includes(context.name)) {
                duplicateNames.push(context.name);
            }
        } else {
            seen.add(context.name);
        }
    }

    if (duplicateNames.length > 0) {
        return `Duplicate context name(s): ${duplicateNames.join(', ')}. Context names must be unique.`;
    }

    return undefined;
}
