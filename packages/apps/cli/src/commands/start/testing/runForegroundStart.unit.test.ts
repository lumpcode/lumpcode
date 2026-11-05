import { afterEach, describe, expect, it, vi } from 'vitest';

import { command, defaultCronPattern } from '../main';
import { runForegroundStart, type StartHandlerDeps } from './testHelpers';

const deps: StartHandlerDeps = {
    projectRoot: '/tmp/run-foreground-start-not-a-project',
    remoteDir: '/tmp/run-foreground-start-remote',
    globalConfigFolderPath: '/tmp/run-foreground-start-global',
};

describe('runForegroundStart', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('passes foreground and the default cron through to the start handler', async () => {
        const result = await runForegroundStart({
            deps,
            options: { superviseOnly: true },
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toBe(
            '--superviseOnly cannot be combined with --cronSetup, --foreground.',
        );
    });

    it('merges caller options after those defaults', async () => {
        const result = await runForegroundStart({
            deps,
            options: { superviseOnly: true, include: 'alpha' },
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toBe(
            '--superviseOnly cannot be combined with --include, --cronSetup, --foreground.',
        );
    });

    it('forwards a shutdown override and the handler result', async () => {
        const handlerResult = { success: true as const, data: { messages: ['ok'] } };
        const handler = vi.fn(async () => handlerResult);
        const maker = vi.spyOn(command, 'handlerMaker').mockReturnValue(handler as never);
        const waitForShutdownOverride = vi.fn(async () => {});

        await expect(
            runForegroundStart({
                deps,
                options: { include: 'alpha', cronSetup: '0 * * * *' },
                waitForShutdownOverride,
            }),
        ).resolves.toBe(handlerResult);

        expect(maker).toHaveBeenCalledWith(
            expect.objectContaining({
                projectRoot: deps.projectRoot,
                globalConfigFolderPath: deps.globalConfigFolderPath,
                skipEnsureSupervisor: true,
                waitForShutdownOverride,
            }),
        );
        expect(handler).toHaveBeenCalledWith({
            options: {
                foreground: true,
                cronSetup: '0 * * * *',
                include: 'alpha',
            },
            arguments: {},
        });
    });

    it('uses an already-resolved shutdown when the override is omitted', async () => {
        const handler = vi.fn(async () => ({ success: true as const, data: { messages: [] } }));
        const maker = vi.spyOn(command, 'handlerMaker').mockReturnValue(handler as never);

        await runForegroundStart({ deps });

        const waitForShutdownOverride = maker.mock.calls[0]?.[0].waitForShutdownOverride;
        expect(waitForShutdownOverride).toEqual(expect.any(Function));
        await expect(waitForShutdownOverride?.()).resolves.toBeUndefined();
        expect(handler).toHaveBeenCalledWith({
            options: {
                foreground: true,
                cronSetup: defaultCronPattern,
            },
            arguments: {},
        });
    });
});
