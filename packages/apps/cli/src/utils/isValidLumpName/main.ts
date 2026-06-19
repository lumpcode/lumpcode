export function isValidLumpName(name: string): boolean {
    return assertValidLumpName(name).ok;
}

export function assertValidLumpName(name: string): { ok: true } | { ok: false; message: string } {
    const trimmed = name.trim();
    if (!trimmed) {
        return { ok: false, message: 'Lump name must not be empty' };
    }
    if (trimmed !== name) {
        return { ok: false, message: 'Lump name must not have leading or trailing whitespace' };
    }
    if (trimmed.includes('/') || trimmed.includes('\\')) {
        return { ok: false, message: 'Lump name must not contain path separators' };
    }
    if (trimmed === '.' || trimmed === '..') {
        return { ok: false, message: 'Invalid lump name' };
    }
    return { ok: true };
}
