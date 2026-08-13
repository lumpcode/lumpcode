function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const CONTEXT_NAME_CHAR = '[A-Za-z0-9_-]';

/** Context names after `lumpPrefix` (`LUMP: <lump> - `) in a commit message, end-bounded like marker match. */
export function contextNamesAfterLumpPrefix(message: string, lumpPrefix: string): string[] {
    if (lumpPrefix.length === 0) return [];
    const matches = message.matchAll(
        new RegExp(`${escapeRegExp(lumpPrefix)}(${CONTEXT_NAME_CHAR}+)(?!${CONTEXT_NAME_CHAR})`, 'g'),
    );
    return [...matches].map((match) => match[1]!);
}
