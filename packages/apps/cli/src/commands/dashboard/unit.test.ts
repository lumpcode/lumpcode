import type { AddressInfo } from 'node:net';
import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';

import { command as daemonStatusCommand } from '../daemon-status';
import { createDaemonCommandTestProject, writeLocalJson } from '../../testing';
import { createTempTestDirs, removeTempTestDirs } from '../../utils';
import { command as dashboardCommand, resolveDashboardListen, type Input } from './main';

const SHARED_MODE_DASHBOARD_MESSAGE =
    'lumpcode dashboard is dedicated-only. Use a worker clone with mode: dedicated (another copy of the repo on this machine is enough).';

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

async function canListen(port: number): Promise<boolean> {
    const server = createServer();
    try {
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(port, '127.0.0.1', () => resolve());
        });
        return true;
    } catch {
        return false;
    } finally {
        if (server.listening) {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        }
    }
}

describe('dashboard command', () => {
    it('defaults the listen address to 127.0.0.1:4747', () => {
        expect(resolveDashboardListen({})).toEqual({ port: 4747, bind: '127.0.0.1' });
        expect(resolveDashboardListen({ port: 9, bind: '0.0.0.0' })).toEqual({ port: 9, bind: '0.0.0.0' });
    });

    it('rejects a port outside 1 through 65535 in the command schema', () => {
        expect(dashboardCommand.inputSchema.safeParse({ options: { port: 0 }, arguments: {} }).success).toBe(false);
        expect(dashboardCommand.inputSchema.safeParse({ options: { port: 65536 }, arguments: {} }).success).toBe(false);
        expect(dashboardCommand.inputSchema.safeParse({ options: { port: 4747 }, arguments: {} }).success).toBe(true);
        expect(dashboardCommand.inputSchema.safeParse({ options: { bind: '' }, arguments: {} }).success).toBe(false);
    });

    it('fails when the directory is not a Lumpcode project and does not listen', async () => {
        const dirs = await createTempTestDirs({
            prefix: 'lump-dashboard-bad-',
            remote: false,
            mkdirLocalConfig: false,
        });
        const port = await freePort();
        try {
            const result = await dashboardCommand.handlerMaker({
                projectRoot: dirs.projectRoot,
                localConfigFolderPath: dirs.localConfigFolderPath,
                globalConfigFolderPath: dirs.globalConfigFolderPath ?? dirs.projectRoot,
            })({ options: { port }, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages[0]).toContain('Not a Lumpcode project root');
            expect(await canListen(port)).toBe(true);
        } finally {
            await removeTempTestDirs(dirs);
        }
    });

    it('returns sharedModeNoDaemon for a shared checkout and does not listen', async () => {
        const project = await createDaemonCommandTestProject({
            prefix: 'lump-dashboard-shared-',
            projectName: 'dashboard-shared',
            bindDaemonTestEnv: false,
        });
        const port = await freePort();
        try {
            await writeLocalJson(project.localConfigFolderPath, { mode: 'shared', primaryBranch: 'main' });
            const result = await dashboardCommand.handlerMaker({
                projectRoot: project.projectRoot,
                localConfigFolderPath: project.localConfigFolderPath,
                globalConfigFolderPath: project.globalConfigFolderPath,
            })({ options: { port }, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages).toEqual([SHARED_MODE_DASHBOARD_MESSAGE]);
            expect(result.data.data).toEqual({ code: 'sharedModeNoDaemon' });
            expect(await canListen(port)).toBe(true);
        } finally {
            await removeTempTestDirs(project);
        }
    });

    it('serves the list-all snapshot on a dedicated project', async () => {
        const project = await createDaemonCommandTestProject({
            prefix: 'lump-dashboard-dedicated-',
            projectName: 'dashboard-dedicated',
            bindDaemonTestEnv: false,
        });
        const port = await freePort();
        const logs: string[] = [];
        const spy = vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
            logs.push(String(message));
        });
        let release = () => {};
        const stopped = new Promise<void>((resolve) => {
            release = resolve;
        });
        const pending = dashboardCommand.handlerMaker({
            projectRoot: project.projectRoot,
            localConfigFolderPath: project.localConfigFolderPath,
            globalConfigFolderPath: project.globalConfigFolderPath,
            waitForShutdownOverride: () => stopped,
        })({ options: { port }, arguments: {} });
        try {
            await vi.waitFor(() => {
                expect(logs.some((line) => line.startsWith('Dashboard: http://'))).toBe(true);
            });
            expect(logs.join('\n')).not.toContain('no authentication');
            const url = logs.find((line) => line.startsWith('Dashboard: http://'))!.slice('Dashboard: '.length);
            expect(url).toBe(`http://127.0.0.1:${port}`);

            const status = await daemonStatusCommand.handlerMaker({
                projectRoot: project.projectRoot,
                localConfigFolderPath: project.localConfigFolderPath,
                globalConfigFolderPath: project.globalConfigFolderPath,
            })({ options: {}, arguments: {} });
            expect(status.success).toBe(true);
            if (!status.success) throw new Error('unreachable');

            await vi.waitFor(async () => {
                const snapshot = await (await fetch(`${url}/snapshot`)).json() as { status?: unknown };
                expect(snapshot.status).toEqual(status.data.data);
            });
            const html = await (await fetch(url)).text();
            expect(html).toContain('dashboard-dedicated');
            expect(html).toContain('Supervisor: not running.');
            expect(html).toContain('No daemons running.');
            expect(html).not.toMatch(/<button/i);
            expect(html).not.toMatch(/<form/i);
        } finally {
            release();
            await pending;
            spy.mockRestore();
            await removeTempTestDirs(project);
        }
    });

    it('prints the no-authentication warning for a non-loopback bind and still serves', async () => {
        const project = await createDaemonCommandTestProject({
            prefix: 'lump-dashboard-bind-',
            projectName: 'dashboard-bind',
            bindDaemonTestEnv: false,
        });
        const port = await freePort();
        const logs: string[] = [];
        const spy = vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
            logs.push(String(message));
        });
        let release = () => {};
        const stopped = new Promise<void>((resolve) => {
            release = resolve;
        });
        const options: Input['options'] = { port, bind: '0.0.0.0' };
        const pending = dashboardCommand.handlerMaker({
            projectRoot: project.projectRoot,
            localConfigFolderPath: project.localConfigFolderPath,
            globalConfigFolderPath: project.globalConfigFolderPath,
            waitForShutdownOverride: () => stopped,
        })({ options, arguments: {} });
        try {
            await vi.waitFor(() => {
                expect(logs.some((line) => line.includes('no authentication'))).toBe(true);
            });
            expect(logs).toContain('Dashboard: http://0.0.0.0:' + String(port));
            expect(logs).toContain('Warning: the dashboard is reachable on 0.0.0.0 with no authentication.');
            const response = await fetch(`http://127.0.0.1:${port}/`);
            expect(response.ok).toBe(true);
        } finally {
            release();
            const result = await pending;
            spy.mockRestore();
            await removeTempTestDirs(project);
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data.printed).toBe(true);
            expect(result.data.data?.bindWarning).toContain('no authentication');
        }
    });

    it('prints one JSON startup line with url and bindWarning', async () => {
        const project = await createDaemonCommandTestProject({
            prefix: 'lump-dashboard-json-',
            projectName: 'dashboard-json',
            bindDaemonTestEnv: false,
        });
        const port = await freePort();
        const logs: string[] = [];
        const spy = vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
            logs.push(String(message));
        });
        let release = () => {};
        const stopped = new Promise<void>((resolve) => {
            release = resolve;
        });
        const pending = dashboardCommand.handlerMaker({
            projectRoot: project.projectRoot,
            localConfigFolderPath: project.localConfigFolderPath,
            globalConfigFolderPath: project.globalConfigFolderPath,
            waitForShutdownOverride: () => stopped,
        })({ options: { port, bind: '0.0.0.0', json: true }, arguments: {} });
        try {
            await vi.waitFor(() => expect(logs).toHaveLength(1));
            const parsed = JSON.parse(logs[0]!) as { data?: { url?: string; bindWarning?: string } };
            expect(parsed.data?.url).toBe(`http://0.0.0.0:${port}`);
            expect(parsed.data?.bindWarning).toBe('Warning: the dashboard is reachable on 0.0.0.0 with no authentication.');
        } finally {
            release();
            await pending;
            spy.mockRestore();
            await removeTempTestDirs(project);
        }
    });

    it('returns portInUse when the port is taken', async () => {
        const project = await createDaemonCommandTestProject({
            prefix: 'lump-dashboard-port-',
            projectName: 'dashboard-port',
            bindDaemonTestEnv: false,
        });
        const port = await freePort();
        const holder = createServer();
        await new Promise<void>((resolve) => {
            holder.listen(port, '127.0.0.1', () => resolve());
        });
        try {
            const result = await dashboardCommand.handlerMaker({
                projectRoot: project.projectRoot,
                localConfigFolderPath: project.localConfigFolderPath,
                globalConfigFolderPath: project.globalConfigFolderPath,
            })({ options: { port }, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.data).toEqual({ code: 'portInUse' });
            expect(result.data.messages).toEqual([`Port ${port} is already in use.`]);
        } finally {
            await new Promise<void>((resolve, reject) => {
                holder.close((error) => (error ? reject(error) : resolve()));
            });
            await removeTempTestDirs(project);
        }
    });
});
