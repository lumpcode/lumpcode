import { describe, expect, it } from 'vitest';

import { dashboardNotices, SNAPSHOT_STALE_AFTER_MS, STATUS_POLL_INTERVAL_MS } from './snapshotTiming';

describe('snapshotTiming', () => {
    it('uses a 5s poll and a 30s stale threshold', () => {
        expect(STATUS_POLL_INTERVAL_MS).toBe(5_000);
        expect(SNAPSHOT_STALE_AFTER_MS).toBe(30_000);
    });

    it('shows neither notice before the first read finishes', () => {
        expect(dashboardNotices({ nowMs: 1_000 })).toEqual({
            showFailureNote: false,
            showStaleWarning: false,
        });
    });

    it('shows the failure note when the first read fails', () => {
        expect(dashboardNotices({ nowMs: 1_000, readError: 'disk failed' })).toEqual({
            showFailureNote: true,
            showStaleWarning: false,
        });
    });

    it('shows the failure note while the last success is under 30 seconds old', () => {
        const fetchedAt = new Date(1_000).toISOString();
        expect(dashboardNotices({
            nowMs: 1_000 + SNAPSHOT_STALE_AFTER_MS - 1,
            fetchedAt,
            readError: 'disk failed',
        })).toEqual({
            showFailureNote: true,
            showStaleWarning: false,
        });
    });

    it('shows the stale warning once the last success is 30 seconds old', () => {
        const fetchedAt = new Date(1_000).toISOString();
        expect(dashboardNotices({
            nowMs: 1_000 + SNAPSHOT_STALE_AFTER_MS,
            fetchedAt,
            readError: 'disk failed',
        })).toEqual({
            showFailureNote: false,
            showStaleWarning: true,
        });
    });

    it('shows the stale warning without a read error when the snapshot ages', () => {
        const fetchedAt = new Date(0).toISOString();
        expect(dashboardNotices({
            nowMs: SNAPSHOT_STALE_AFTER_MS,
            fetchedAt,
        })).toEqual({
            showFailureNote: false,
            showStaleWarning: true,
        });
    });

    it('shows neither notice for a fresh successful snapshot', () => {
        const nowMs = 10_000;
        expect(dashboardNotices({
            nowMs,
            fetchedAt: new Date(nowMs).toISOString(),
        })).toEqual({
            showFailureNote: false,
            showStaleWarning: false,
        });
    });
});
