export const STATUS_POLL_INTERVAL_MS = 5_000;

export const SNAPSHOT_STALE_AFTER_MS = 30_000;

export function dashboardNotices(input: {
    nowMs: number;
    fetchedAt?: string;
    readError?: string;
}): { showFailureNote: boolean; showStaleWarning: boolean } {
    const { nowMs, fetchedAt, readError } = input;
    if (fetchedAt !== undefined) {
        const age = nowMs - Date.parse(fetchedAt);
        if (age >= SNAPSHOT_STALE_AFTER_MS) {
            return { showFailureNote: false, showStaleWarning: true };
        }
    }
    if (readError !== undefined) {
        return { showFailureNote: true, showStaleWarning: false };
    }
    return { showFailureNote: false, showStaleWarning: false };
}
