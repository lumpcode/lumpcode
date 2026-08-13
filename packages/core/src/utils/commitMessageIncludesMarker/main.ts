const MARKER_CONTINUE = '[A-Za-z0-9_-]';

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when `marker` occurs in `message` and is not a prefix of a longer `[A-Za-z0-9_-]*` token. */
export function commitMessageIncludesMarker(message: string, marker: string): boolean {
    if (marker.length === 0) return false;
    return new RegExp(`${escapeRegExp(marker)}(?!${MARKER_CONTINUE})`).test(message);
}
