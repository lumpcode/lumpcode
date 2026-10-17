import type { AddressInfo } from 'node:net';
import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';

import { formatDashboardUrl } from './dashboardUrl';
import { startDashboardServer } from './server';
import { STATUS_POLL_INTERVAL_MS } from './snapshotTiming';
import type { DashboardStatus } from './types';

const idleStatus: DashboardStatus = {
    projectName: 'demo',
    daemons: [],
    supervisor: { running: false },
};

const richStatus: DashboardStatus = {
    projectName: 'acme',
    daemons: [
        {
            daemonId: 'global',
            running: true,
            pid: 7,
            inFlightRuns: [{ lumpName: 'backlog', contextName: 'ctx-a' }],
        },
    ],
    supervisor: { running: true, pid: 3 },
};

async function freePort(): Promise<number> {
    const server = createServer();
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address() as AddressInfo;
    await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
    });
    return address.port;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

describe('formatDashboardUrl', () => {
    it('brackets an IPv6 host once', () => {
        expect(formatDashboardUrl('::1', 4747)).toBe('http://[::1]:4747');
        expect(formatDashboardUrl('[::1]', 4747)).toBe('http://[::1]:4747');
        expect(formatDashboardUrl('127.0.0.1', 4747)).toBe('http://127.0.0.1:4747');
        expect(formatDashboardUrl('localhost', 9)).toBe('http://localhost:9');
    });
});

describe('startDashboardServer', () => {
    it('fails with portInUse and close frees the port', async () => {
        const port = await freePort();
        const first = await startDashboardServer({
            port,
            bind: '127.0.0.1',
            readStatus: async () => ({ ok: true, status: idleStatus }),
        });
        expect(first.success).toBe(true);
        if (!first.success) throw new Error('unreachable');

        const blocked = await startDashboardServer({
            port,
            bind: '127.0.0.1',
            readStatus: async () => ({ ok: true, status: idleStatus }),
        });
        expect(blocked.success).toBe(false);
        if (blocked.success) throw new Error('unreachable');
        expect(blocked.data.code).toBe('portInUse');
        expect(blocked.data.message).toBe(`Port ${port} is already in use.`);

        await first.data.close();

        const again = await startDashboardServer({
            port,
            bind: '127.0.0.1',
            readStatus: async () => ({ ok: true, status: idleStatus }),
        });
        expect(again.success).toBe(true);
        if (!again.success) throw new Error('unreachable');
        expect(again.data.url).toBe(`http://127.0.0.1:${port}`);
        await again.data.close();
    });

    it('serves the stub snapshot on the page', async () => {
        const port = await freePort();
        const started = await startDashboardServer({
            port,
            bind: '127.0.0.1',
            readStatus: async () => ({ ok: true, status: richStatus }),
        });
        expect(started.success).toBe(true);
        if (!started.success) throw new Error('unreachable');
        try {
            await vi.waitFor(async () => {
                const response = await fetch(`${started.data.url}/`);
                const html = await response.text();
                expect(html).toContain('acme');
                expect(html).toContain('backlog');
                expect(html).toContain('ctx-a');
                expect(html).not.toMatch(/<button/i);
            });
            const view = await fetch(`${started.data.url}/view`);
            expect(await view.text()).toContain('Supervisor: running (pid 3).');
        } finally {
            await started.data.close();
        }
    });

    it('starts the first read on listen and does not overlap a slow read', async () => {
        const port = await freePort();
        let calls = 0;
        let inFlight = 0;
        let maxInFlight = 0;
        let releaseFirst: () => void = () => {};
        const gate = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        const started = await startDashboardServer({
            port,
            bind: '127.0.0.1',
            readStatus: async () => {
                calls += 1;
                inFlight += 1;
                maxInFlight = Math.max(maxInFlight, inFlight);
                try {
                    if (calls === 1) await gate;
                    return { ok: true, status: idleStatus };
                } finally {
                    inFlight -= 1;
                }
            },
        });
        expect(started.success).toBe(true);
        if (!started.success) throw new Error('unreachable');
        try {
            await vi.waitFor(() => expect(calls).toBe(1));
            expect(inFlight).toBe(1);
            await delay(100);
            expect(calls).toBe(1);
            expect(maxInFlight).toBe(1);
            releaseFirst();
            await vi.waitFor(() => expect(inFlight).toBe(0));
            const releasedAt = Date.now();
            await delay(200);
            expect(calls).toBe(1);
            await vi.waitFor(() => expect(calls).toBe(2), { timeout: STATUS_POLL_INTERVAL_MS + 3_000 });
            expect(Date.now() - releasedAt).toBeGreaterThanOrEqual(STATUS_POLL_INTERVAL_MS - 250);
            expect(maxInFlight).toBe(1);
        } finally {
            await started.data.close();
        }
    });

    it('replaces status on success and keeps it when a later read fails', async () => {
        const port = await freePort();
        let calls = 0;
        const started = await startDashboardServer({
            port,
            bind: '127.0.0.1',
            readStatus: async () => {
                calls += 1;
                if (calls === 1) return { ok: false, message: 'disk failed' };
                if (calls === 2) return { ok: true, status: richStatus };
                return { ok: false, message: 'later failed' };
            },
        });
        expect(started.success).toBe(true);
        if (!started.success) throw new Error('unreachable');
        try {
            await vi.waitFor(async () => {
                const body = await (await fetch(`${started.data.url}/snapshot`)).json() as {
                    readError?: string;
                    status?: { projectName: string };
                    fetchedAt?: string;
                };
                expect(body.readError).toBe('disk failed');
                expect(body.status).toBeUndefined();
            });

            await vi.waitFor(async () => {
                const body = await (await fetch(`${started.data.url}/snapshot`)).json() as {
                    readError?: string;
                    status?: { projectName: string; daemons: unknown[] };
                    fetchedAt?: string;
                };
                expect(body.status).toEqual(richStatus);
                expect(body.readError).toBeUndefined();
                expect(body.fetchedAt).toEqual(expect.any(String));
            }, { timeout: STATUS_POLL_INTERVAL_MS + 3_000 });

            const successBody = await (await fetch(`${started.data.url}/snapshot`)).json() as { fetchedAt?: string };
            await vi.waitFor(async () => {
                const body = await (await fetch(`${started.data.url}/snapshot`)).json() as {
                    readError?: string;
                    status?: DashboardStatus;
                    fetchedAt?: string;
                };
                expect(body.readError).toBe('later failed');
                expect(body.status).toEqual(richStatus);
                expect(body.fetchedAt).toBe(successBody.fetchedAt);
            }, { timeout: STATUS_POLL_INTERVAL_MS + 3_000 });
        } finally {
            await started.data.close();
        }
    });
});
