/**
 * Full-string lump-name pattern match. Only `*` is a metacharacter
 * (zero-or-more chars). `?` is literal. No `**` / path semantics.
 */
export function matchLumpNamePattern(input: { pattern: string; name: string }): boolean {
    const { pattern, name } = input;
    let pi = 0;
    let ni = 0;
    let starPi = -1;
    let starNi = -1;

    while (ni < name.length) {
        if (pi < pattern.length && pattern[pi] === '*') {
            starPi = pi;
            starNi = ni;
            pi += 1;
            continue;
        }
        if (pi < pattern.length && pattern[pi] === name[ni]) {
            pi += 1;
            ni += 1;
            continue;
        }
        if (starPi !== -1) {
            pi = starPi + 1;
            starNi += 1;
            ni = starNi;
            continue;
        }
        return false;
    }

    while (pi < pattern.length && pattern[pi] === '*') {
        pi += 1;
    }
    return pi === pattern.length;
}

/** True when the pattern contains a `*` glob metacharacter. */
export function isLumpNameGlobPattern(pattern: string): boolean {
    return pattern.includes('*');
}

export type LumpNameFilter = {
    include?: string[];
    exclude?: string[];
};

export type FilterLumpNamesInput = {
    names: readonly string[];
    include?: readonly string[];
    exclude?: readonly string[];
};

/**
 * Selects lump names: include (omit/empty = all) then exclude.
 * Preserves source `names` order.
 */
export function filterLumpNames(input: FilterLumpNamesInput): string[] {
    const { names, include, exclude } = input;
    const includePatterns = include?.filter((p) => p.length > 0);
    const excludePatterns = exclude?.filter((p) => p.length > 0);

    const afterInclude =
        includePatterns === undefined || includePatterns.length === 0
            ? [...names]
            : names.filter((name) =>
                  includePatterns.some((pattern) => matchLumpNamePattern({ pattern, name })),
              );
    if (excludePatterns === undefined || excludePatterns.length === 0) {
        return afterInclude;
    }
    return afterInclude.filter(
        (name) =>
            !excludePatterns.some((pattern) => matchLumpNamePattern({ pattern, name })),
    );
}

/** Split comma-separated CLI values; trim; drop empties. Arrays are flattened. */
export function parseLumpNameFilterPatterns(
    value: string | string[] | undefined,
): string[] {
    if (value === undefined) {
        return [];
    }
    const parts = Array.isArray(value) ? value : [value];
    return parts
        .flatMap((part) => part.split(','))
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

export function isLumpNameFilterActive(filter: LumpNameFilter): boolean {
    return Boolean(filter.include?.length || filter.exclude?.length);
}
