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
    const afterInclude =
        include === undefined || include.length === 0
            ? [...names]
            : names.filter((name) =>
                  include.some((pattern) => matchLumpNamePattern({ pattern, name })),
              );
    if (exclude === undefined || exclude.length === 0) {
        return afterInclude;
    }
    return afterInclude.filter(
        (name) => !exclude.some((pattern) => matchLumpNamePattern({ pattern, name })),
    );
}
