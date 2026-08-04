/**
 * Full-string lump-name pattern match. Only `*` is a metacharacter
 * (zero-or-more chars). `?` is literal. No `**` / path semantics.
 */
export function matchLumpNamePattern(_input: { pattern: string; name: string }): boolean {
    throw new Error('not implemented');
}

export type FilterLumpNamesInput = {
    names: readonly string[];
    include?: readonly string[];
    exclude?: readonly string[];
};

/**
 * Selects lump names: include (omit/empty = all) then exclude.
 * Preserves source `names` order. Stub until implementation.
 */
export function filterLumpNames(_input: FilterLumpNamesInput): string[] {
    throw new Error('not implemented');
}
