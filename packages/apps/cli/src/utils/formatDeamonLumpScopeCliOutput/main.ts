export function formatDeamonLumpScopeCliOutput(input: {
    lumpName?: string;
    lumpNames: readonly string[];
    quoteLumpName?: boolean;
}): string { // TODO : rename to formatDeamonLumpScopeCliOutput
    const { lumpName, lumpNames, quoteLumpName = false } = input;
    if (lumpName !== undefined) {
        const label = quoteLumpName ? `"${lumpName}"` : lumpName;
        return `Lump: ${label}`;
    }
    return `Lumps: ${lumpNames.join(', ')}`;
}
