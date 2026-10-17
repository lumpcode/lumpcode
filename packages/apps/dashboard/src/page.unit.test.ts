import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

import { renderDashboardDocument, renderDashboardView } from './page';
import { SNAPSHOT_STALE_AFTER_MS, STATUS_POLL_INTERVAL_MS } from './snapshotTiming';
import type { DashboardStatus, DashboardView } from './types';

const richStatus: DashboardStatus = {
    projectName: 'acme',
    supervisor: {
        running: true,
        pid: 42,
        pidFilePath: '/tmp/supervisor.pid',
        logFilePath: '/tmp/supervisor.log',
    },
    daemons: [
        {
            daemonId: 'global',
            running: true,
            pid: 99,
            cronSetup: '*/5 * * * *',
            include: ['backlog'],
            exclude: ['docs'],
            tickPhase: 'running',
            nextTickAt: '2026-10-12T12:00:00.000Z',
            inFlightRuns: [
                { lumpName: 'backlog', effectiveDiscoveryBranch: 'dev', contextName: 'ctx-a' },
                { lumpName: 'qol' },
            ],
            localConfigStale: true,
            maxParallelRun: 2,
            logFilePath: '/tmp/daemon.log',
        },
        {
            daemonId: 'nightly',
            running: true,
            pid: 100,
            tickPhase: 'idle',
            inFlightRuns: [],
            snapshotIncomplete: true,
        },
    ],
};

function view(overrides: DashboardView = {}): DashboardView {
    return overrides;
}

describe('dashboard page', () => {
    it('copies the website color tokens onto the page', () => {
        const cssPath = fileURLToPath(new URL('../../website/app/assets/css/main.css', import.meta.url));
        const css = readFileSync(cssPath, 'utf8');
        const root = css.match(/:root \{[^}]*\}/)?.[0];
        expect(root).toBeTruthy();
        const html = renderDashboardDocument(view(), 0);
        expect(html).toContain(root);
        expect(html).toContain('Lumpcode Worker Dashboard');
        expect(html).toContain('data:image/png;base64,');
        expect(html).toContain(`const pollMs = ${STATUS_POLL_INTERVAL_MS}`);
        expect(html).toContain("fetch('/view'");
        expect(html).not.toMatch(/<button/i);
        expect(html).not.toMatch(/<form/i);
    });

    it('shows an idle project with no daemon rows', () => {
        const html = renderDashboardView({
            fetchedAt: '2026-10-12T12:00:00.000Z',
            status: {
                projectName: 'acme',
                daemons: [],
                supervisor: { running: false },
            },
        }, Date.parse('2026-10-12T12:00:01.000Z'));
        expect(html).toContain('acme');
        expect(html).toContain('Supervisor: not running.');
        expect(html).toContain('No daemons running.');
        expect(html).not.toContain('<article');
    });

    it('shows daemon snapshot facts and the two warning notes', () => {
        const html = renderDashboardView({
            fetchedAt: '2026-10-12T12:00:00.000Z',
            status: richStatus,
        }, Date.parse('2026-10-12T12:00:01.000Z'));
        expect(html).toContain('acme');
        expect(html).toContain('Supervisor: running (pid 42).');
        expect(html).toContain('global: running (pid 99)');
        expect(html).toContain('*/5 * * * *');
        expect(html).toContain('backlog');
        expect(html).toContain('dev');
        expect(html).toContain('ctx-a');
        expect(html).toContain('qol');
        expect(html).toContain('running');
        expect(html).toContain('2026-10-12T12:00:00.000Z');
        expect(html).toContain('local.json changed. A restart is required to apply it.');
        expect(html).toContain('In-flight work was reported without detail.');
        expect(html).toContain('maxParallelRun');
        expect(html).toContain('docs');
        expect(html).toContain('/tmp/daemon.log');
        expect(html).not.toContain('undefined');
        expect(html).not.toMatch(/<button/i);
        expect(html).toContain('<li><span>Lump</span> qol</li>');
        const nightly = html.slice(html.indexOf('nightly'));
        expect(nightly).toContain('In-flight work was reported without detail.');
        expect(nightly).not.toContain('No lump line in flight.');
    });

    it('keeps the last status beside a failure note under 30 seconds', () => {
        const fetchedAt = '2026-10-12T12:00:00.000Z';
        const html = renderDashboardView({
            fetchedAt,
            readError: 'disk failed',
            status: {
                projectName: 'acme',
                daemons: [],
                supervisor: { running: false },
            },
        }, Date.parse(fetchedAt) + SNAPSHOT_STALE_AFTER_MS - 1);
        expect(html).toContain('Status read failed: disk failed.');
        expect(html).toContain(`Last success: ${fetchedAt}.`);
        expect(html).toContain('acme');
        expect(html).not.toContain('seconds old');
    });

    it('shows the stale warning with the read error at 30 seconds', () => {
        const fetchedAt = '2026-10-12T12:00:00.000Z';
        const html = renderDashboardView({
            fetchedAt,
            readError: 'still failing',
            status: {
                projectName: 'acme',
                daemons: [{ daemonId: 'global', running: false }],
                supervisor: { running: false },
            },
        }, Date.parse(fetchedAt) + SNAPSHOT_STALE_AFTER_MS);
        expect(html).toContain(`at least ${SNAPSHOT_STALE_AFTER_MS / 1000} seconds old`);
        expect(html).toContain('Latest read failed: still failing.');
        expect(html).not.toContain('Status read failed:');
        expect(html).toContain('global: not running');
    });

    it('shows the failure note and no daemon rows before the first success', () => {
        const html = renderDashboardView({ readError: 'missing project' }, 0);
        expect(html).toContain('Status read failed: missing project.');
        expect(html).toContain('No snapshot yet.');
        expect(html).not.toContain('<article');
        expect(html).not.toContain('seconds old');
    });
});
