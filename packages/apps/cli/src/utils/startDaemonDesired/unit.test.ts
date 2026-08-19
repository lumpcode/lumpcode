import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    fromMeta,
    markStartDaemonDesiredStopping,
    readStartDaemonDesired,
    recipeFromDesired,
    toDesired,
    toForegroundArgs,
    toMetaWrite,
    writeStartDaemonDesired,
} from './main';

describe('startDaemonDesired', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-desired-'));
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('round-trips a desired file without stopping', async () => {
        const desiredFilePath = path.join(dir, 'demo.global.daemon.desired.json');
        const desired = {
            projectRoot: '/tmp/proj',
            daemonId: 'global',
            cronSetup: '*/5 * * * *',
            include: ['backlog'],
        };
        const writeResult = await writeStartDaemonDesired({ desiredFilePath, desired });
        expect(writeResult.success).toBe(true);
        const readResult = await readStartDaemonDesired(desiredFilePath);
        expect(readResult.success).toBe(true);
        if (!readResult.success) throw new Error('unreachable');
        expect(readResult.data).toEqual(desired);
    });

    it('returns undefined when the desired file is missing', async () => {
        const result = await readStartDaemonDesired(path.join(dir, 'missing.json'));
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toBeUndefined();
    });

    it('marks stopping on an existing desired file and no-ops when missing', async () => {
        const desiredFilePath = path.join(dir, 'demo.alpha.daemon.desired.json');
        await writeStartDaemonDesired({
            desiredFilePath,
            desired: { projectRoot: '/tmp/proj', daemonId: 'alpha', cronSetup: '*/5 * * * *' },
        });
        const marked = await markStartDaemonDesiredStopping({ desiredFilePath });
        expect(marked.success).toBe(true);
        const readResult = await readStartDaemonDesired(desiredFilePath);
        expect(readResult.success).toBe(true);
        if (!readResult.success) throw new Error('unreachable');
        expect(readResult.data?.stopping).toBe(true);

        const missing = await markStartDaemonDesiredStopping({
            desiredFilePath: path.join(dir, 'nope.json'),
        });
        expect(missing.success).toBe(true);

        const already = await markStartDaemonDesiredStopping({ desiredFilePath });
        expect(already.success).toBe(true);
        const reread = await readStartDaemonDesired(desiredFilePath);
        expect(reread.success).toBe(true);
        if (!reread.success) throw new Error('unreachable');
        expect(reread.data?.stopping).toBe(true);
    });

    const recipe = {
        projectRoot: '/tmp/proj',
        daemonId: 'agents',
        cronSetup: '*/7 * * * *',
        workspaceStrategy: 'worktree' as const,
        include: ['backlog'],
        maxParallelRun: 2,
    };

    it('builds start --foreground argv plus optional flags', () => {
        expect(toForegroundArgs(recipe, { json: true, verbose: true })).toEqual([
            'start',
            '--foreground',
            '--cronSetup',
            '*/7 * * * *',
            '--daemonId',
            'agents',
            '--include',
            'backlog',
            '--maxParallelRun',
            '2',
            '--json',
            '--verbose',
        ]);
    });

    it('fromMeta maps include from legacy lumpName', () => {
        expect(
            fromMeta(
                {
                    lumpName: 'alpha',
                    workspaceStrategy: 'checkout',
                    cronSetup: '*/9 * * * *',
                },
                { projectRoot: '/tmp/proj', daemonId: 'global' },
            ),
        ).toEqual({
            projectRoot: '/tmp/proj',
            daemonId: 'global',
            cronSetup: '*/9 * * * *',
            include: ['alpha'],
        });
    });

    it('toDesired drops workspaceStrategy and toMetaWrite copies recipe fields', () => {
        expect(toDesired(recipe)).toEqual({
            projectRoot: '/tmp/proj',
            daemonId: 'agents',
            cronSetup: '*/7 * * * *',
            include: ['backlog'],
            maxParallelRun: 2,
        });
        expect(toMetaWrite(recipe)).toEqual({
            daemonId: 'agents',
            cronSetup: '*/7 * * * *',
            workspaceStrategy: 'worktree',
            include: ['backlog'],
            maxParallelRun: 2,
        });
    });

    it('recipeFromDesired drops stopping and restores workspaceStrategy', () => {
        expect(
            recipeFromDesired(
                { ...toDesired(recipe), stopping: true },
                'checkout',
            ),
        ).toEqual({
            projectRoot: '/tmp/proj',
            daemonId: 'agents',
            cronSetup: '*/7 * * * *',
            workspaceStrategy: 'checkout',
            include: ['backlog'],
            maxParallelRun: 2,
        });
    });
});
