import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import * as core from '@lumpcode/core';

import { DEFAULT_DAEMON_CRON_SETUP } from '../../../consts';
import {
    createTempTestDirs,
    execGit,
    initBareRemoteAndCheckout,
    removeTempTestDirs,
} from '../../../utils';
import * as installRunAbortHandlersModule from '../../../utils/installRunAbortHandlers';
import * as launchStartDaemonModule from '../../../utils/launchStartDaemon';
import * as planLumpFromJsConfigModule from '../../../utils/planLumpFromJsConfig';
import * as runLumpFromLumpNameModule from '../../../utils/runLumpFromLumpName';
import { command, type Injections, type SetupPrompter } from '../main';

const ORIGINAL_PATH = process.env.PATH;
const WORKER_URL = 'https://www.lumpcode.com/docs/start/worker';
const KEEP_PROJECT = { projectName: 'keep-this-name', primaryBranch: 'main' };
const KEEP_STUB = {
    contextListJson: [{ name: 'KEEP', variables: { FILE: 'KEEP.md' } }],
    prompt: { promptTemplate: 'do not rewrite @{FILE}', command: 'cursor' },
};
const EXTRA_LOCAL = { refreshCommand: 'git fetch --all', disabled: false as const };

function defaultPrompter(overrides: Partial<SetupPrompter> = {}): SetupPrompter {
    return {
        confirm: async ({ defaultValue }) => defaultValue,
        select: async ({ choices }) => choices[0]!.value,
        input: async ({ defaultValue }) => defaultValue ?? '',
        pause: async () => {},
        ...overrides,
    };
}

describe('setup resume and dedicated worker', () => {
    let projectRoot: string;
    let remoteDir: string;
    let runSpy: MockInstance<typeof runLumpFromLumpNameModule.runLumpFromLumpName>;
    let startSpy: MockInstance<typeof launchStartDaemonModule.launchStartDaemon>;
    let pauses = 0;
    const selects: string[] = [];
    const confirms: string[] = [];
    const inputs: string[] = [];

    beforeEach(async () => {
        ({ projectRoot, remoteDir } = await createTempTestDirs({
            prefix: 'lump-setup-resume-',
            global: false,
            mkdirLocalConfig: false,
        }));
        initBareRemoteAndCheckout({ projectRoot, remoteDir });
        await fs.writeFile(path.join(projectRoot, 'README.md'), '# hi\n');
        const binDir = path.join(projectRoot, '.setup-bins');
        await fs.mkdir(binDir, { recursive: true });
        const bin = process.platform === 'win32' ? 'cursor-agent.cmd' : 'cursor-agent';
        await fs.writeFile(
            path.join(binDir, bin),
            process.platform === 'win32' ? '@echo off\r\nexit /b 0\r\n' : '#!/bin/sh\nexit 0\n',
            process.platform === 'win32' ? undefined : { mode: 0o755 },
        );
        process.env.PATH = `${binDir}${path.delimiter}${ORIGINAL_PATH}`;
        pauses = 0;
        selects.length = 0;
        confirms.length = 0;
        inputs.length = 0;
        vi.spyOn(planLumpFromJsConfigModule, 'planLumpFromJsConfig').mockResolvedValue(
            core.success({
                lumpName: 'myFirstLump',
                valid: true,
                disabled: false,
                discoveryBranch: 'main',
                baseBranch: 'main',
                executionWorkspacePath: projectRoot,
                mode: 'shared',
                workspaceStrategy: 'checkout',
                contexts: [{ name: 'KEEP', variables: { FILE: 'KEEP.md' } }],
                todoContextNames: ['KEEP'],
            }),
        );
        runSpy = vi.spyOn(runLumpFromLumpNameModule, 'runLumpFromLumpName').mockResolvedValue(
            core.success({
                skipped: false,
                result: { branchName: 'lump/myFirstLump/KEEP', contextNames: ['KEEP'], contextRunStateList: [] },
            }) as Awaited<ReturnType<typeof runLumpFromLumpNameModule.runLumpFromLumpName>>,
        );
        startSpy = vi.spyOn(launchStartDaemonModule, 'launchStartDaemon').mockResolvedValue(
            core.success({
                messages: [],
                data: { cronSetup: DEFAULT_DAEMON_CRON_SETUP, lumpNames: ['myFirstLump'], ticks: 0, daemonId: 'global' },
            }),
        );
        vi.spyOn(installRunAbortHandlersModule, 'installRunAbortHandlers').mockReturnValue(() => {});
    });

    afterEach(async () => {
        process.env.PATH = ORIGINAL_PATH;
        vi.restoreAllMocks();
        await removeTempTestDirs({ projectRoot, remoteDir });
    });

    async function seedExisting(mode: 'shared' | 'dedicated') {
        const dir = path.join(projectRoot, '.lumpcode');
        await fs.mkdir(path.join(dir, 'lumps', 'myFirstLump'), { recursive: true });
        await fs.writeFile(path.join(dir, 'project.json'), `${JSON.stringify(KEEP_PROJECT, null, 2)}\n`);
        await fs.writeFile(path.join(dir, 'local.json'), `${JSON.stringify({ mode, ...EXTRA_LOCAL }, null, 2)}\n`);
        await fs.writeFile(path.join(dir, 'lumps', 'myFirstLump', 'config.json'), `${JSON.stringify(KEEP_STUB, null, 2)}\n`);
        execGit('add -- .lumpcode/project.json .lumpcode/lumps', projectRoot);
        execGit('commit -m seed-lumpcode', projectRoot);
    }

    function trackingPrompter(overrides: Partial<SetupPrompter> = {}): SetupPrompter {
        const base = defaultPrompter(overrides);
        return {
            confirm: async (input) => {
                confirms.push(input.message);
                return base.confirm(input);
            },
            select: async (input) => {
                selects.push(input.message);
                return base.select(input);
            },
            input: async (input) => {
                inputs.push(input.message);
                return base.input(input);
            },
            pause: async (input) => {
                pauses += 1;
                return base.pause(input);
            },
        };
    }

    async function runSetup(prompter: SetupPrompter) {
        return command.handlerMaker({ isInteractive: () => true, prompter } satisfies Injections)({
            options: { projectPath: projectRoot },
            arguments: {},
        });
    }

    it('keeps project.json and the lump stub, merges local.json extra keys, and still offers edit + commitPush', async () => {
        await seedExisting('dedicated');
        const result = await runSetup(
            trackingPrompter({
                select: async ({ message, choices }) => (/mode/i.test(message) ? 'shared' : choices[0]!.value),
            }),
        );
        expect(result.success).toBe(true);
        const lumpcode = path.join(projectRoot, '.lumpcode');
        expect(JSON.parse(await fs.readFile(path.join(lumpcode, 'project.json'), 'utf-8'))).toEqual(KEEP_PROJECT);
        expect(JSON.parse(await fs.readFile(path.join(lumpcode, 'lumps', 'myFirstLump', 'config.json'), 'utf-8'))).toEqual(
            KEEP_STUB,
        );
        const local = JSON.parse(await fs.readFile(path.join(lumpcode, 'local.json'), 'utf-8')) as Record<string, unknown>;
        expect(local).toMatchObject({ mode: 'shared', ...EXTRA_LOCAL });
        expect(local).not.toHaveProperty('workspaceStrategy');
        expect(local).not.toHaveProperty('maxParallelRun');
        expect(pauses).toBeGreaterThanOrEqual(1);
        expect(selects.some((m) => /mode/i.test(m))).toBe(true);
        expect(selects.some((m) => /strategy/i.test(m))).toBe(false);
        expect(selects.some((m) => /commit|push/i.test(m))).toBe(true);
        expect(inputs.some((m) => /lump name/i.test(m))).toBe(false);
        expect(selects.some((m) => /format|javascript|typescript/i.test(m))).toBe(false);
        expect([...selects, ...confirms].some((m) => /command|agent/i.test(m) && !/skill/i.test(m) && !/run the lump/i.test(m))).toBe(false);
        expect(startSpy).not.toHaveBeenCalled();
        expect(result.data.messages.join('\n')).toContain(WORKER_URL);
    });

    it('asks dedicated wipe confirm and starts an unfiltered global daemon', async () => {
        await seedExisting('dedicated');
        const result = await runSetup(trackingPrompter());
        expect(result.success).toBe(true);
        expect(confirms.some((m) => /reset|wipe|this checkout/i.test(m))).toBe(true);
        expect(selects.some((m) => /strategy/i.test(m))).toBe(true);
        expect(confirms.some((m) => /worker|running/i.test(m))).toBe(true);
        expect(startSpy).toHaveBeenCalledTimes(1);
        const arg = startSpy.mock.calls[0]![0];
        expect(arg.foreground).toBe(false);
        expect(arg.recipe.daemonId).toBe('global');
        expect(arg.recipe.cronSetup).toBe(DEFAULT_DAEMON_CRON_SETUP);
        expect(arg.recipe.include).toBeUndefined();
        expect(arg.recipe.exclude).toBeUndefined();
        expect((result.data.data as { startedDaemon?: boolean }).startedDaemon).toBe(true);
        expect(result.data.messages.join('\n')).toMatch(/daemon-status/);
        expect(result.data.messages.join('\n')).toMatch(/daemon-log/);
        expect(result.data.messages.join('\n')).toMatch(/\bstop\b/);
    });

    it('does not call launchStartDaemon when dedicated run fails', async () => {
        await seedExisting('dedicated');
        runSpy.mockResolvedValue(
            core.failure({ kind: 'message', message: 'agent failed' }) as Awaited<
                ReturnType<typeof runLumpFromLumpNameModule.runLumpFromLumpName>
            >,
        );
        const result = await runSetup(trackingPrompter());
        expect(result.success).toBe(false);
        expect(startSpy).not.toHaveBeenCalled();
    });
});
