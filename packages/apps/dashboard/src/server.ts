import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { failure, success, type Failure, type Success } from '@lumpcode/core';

import { formatDashboardUrl, listenHost } from './dashboardUrl';
import { renderDashboardDocument, renderDashboardView } from './page';
import { dashboardNotices, STATUS_POLL_INTERVAL_MS } from './snapshotTiming';
import type { DashboardView, StartDashboardServerInput } from './types';

function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        if (signal.aborted) {
            resolve();
            return;
        }
        const timer = setTimeout(finish, ms);
        const onAbort = () => {
            clearTimeout(timer);
            finish();
        };
        function finish() {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }
        signal.addEventListener('abort', onAbort, { once: true });
    });
}

function send(response: ServerResponse, statusCode: number, contentType: string, body: string) {
    response.writeHead(statusCode, {
        'content-type': contentType,
        'cache-control': 'no-store',
    });
    response.end(body);
}

function requestPath(url: string | undefined): string {
    if (url === undefined || url === '') return '/';
    try {
        return new URL(url, 'http://127.0.0.1').pathname;
    } catch {
        return '/';
    }
}

async function readOnce(input: {
    readStatus: StartDashboardServerInput['readStatus'];
    view: DashboardView;
}): Promise<DashboardView> {
    try {
        const result = await input.readStatus();
        if (result.ok) {
            return {
                status: result.status,
                fetchedAt: new Date().toISOString(),
            };
        }
        return {
            ...(input.view.status !== undefined ? { status: input.view.status } : {}),
            ...(input.view.fetchedAt !== undefined ? { fetchedAt: input.view.fetchedAt } : {}),
            readError: result.message,
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            ...(input.view.status !== undefined ? { status: input.view.status } : {}),
            ...(input.view.fetchedAt !== undefined ? { fetchedAt: input.view.fetchedAt } : {}),
            readError: message,
        };
    }
}

export function startDashboardServer(input: StartDashboardServerInput): Promise<
    | Success<{ url: string; close: () => Promise<void> }>
    | Failure<{ code: 'portInUse'; message: string }>
> {
    const { port, bind, readStatus } = input;
    let view: DashboardView = {};
    const abort = new AbortController();

    const server = createServer((request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'GET') {
            send(response, 405, 'text/plain; charset=utf-8', 'Method not allowed');
            return;
        }
        const path = requestPath(request.url);
        const nowMs = Date.now();
        if (path === '/snapshot') {
            send(response, 200, 'application/json; charset=utf-8', JSON.stringify({
                ...view,
                notices: dashboardNotices({
                    nowMs,
                    fetchedAt: view.fetchedAt,
                    readError: view.readError,
                }),
            }));
            return;
        }
        if (path === '/view') {
            send(response, 200, 'text/html; charset=utf-8', renderDashboardView(view, nowMs));
            return;
        }
        if (path === '/') {
            send(response, 200, 'text/html; charset=utf-8', renderDashboardDocument(view, nowMs));
            return;
        }
        send(response, 404, 'text/plain; charset=utf-8', 'Not found');
    });

    return new Promise((resolve, reject) => {
        const onListenError = (error: NodeJS.ErrnoException) => {
            server.off('error', onListenError);
            if (error.code === 'EADDRINUSE') {
                resolve(failure({
                    code: 'portInUse' as const,
                    message: `Port ${port} is already in use.`,
                }));
                return;
            }
            reject(error);
        };
        server.once('error', onListenError);
        server.listen(port, listenHost(bind), () => {
            server.off('error', onListenError);
            const loop = (async () => {
                while (!abort.signal.aborted) {
                    view = await readOnce({ readStatus, view });
                    if (abort.signal.aborted) return;
                    await sleep(STATUS_POLL_INTERVAL_MS, abort.signal);
                }
            })();

            let closePromise: Promise<void> | undefined;
            const close = () => {
                if (closePromise !== undefined) return closePromise;
                closePromise = (async () => {
                    abort.abort();
                    await loop.catch(() => undefined);
                    server.closeAllConnections();
                    await new Promise<void>((resolveClose, rejectClose) => {
                        server.close((error) => {
                            if (error) rejectClose(error);
                            else resolveClose();
                        });
                    });
                })();
                return closePromise;
            };

            resolve(success({
                url: formatDashboardUrl(bind, port),
                close,
            }));
        });
    });
}
