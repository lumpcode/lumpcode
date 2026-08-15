import { describe, expect, it, vi, afterEach } from 'vitest';

import { installDaemonProcessGuards } from './main';

function addedListener<E extends 'SIGHUP' | 'uncaughtException' | 'unhandledRejection'>(
    event: E,
    before: NodeJS.Process['listeners'] extends (event: E) => infer R ? R : never,
): (...args: unknown[]) => void {
    const after = process.listeners(event);
    const added = after.find((listener) => !before.includes(listener));
    if (!added) {
        throw new Error(`expected installDaemonProcessGuards to register a ${event} listener`);
    }
    return added as (...args: unknown[]) => void;
}

describe('installDaemonProcessGuards', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('logs and ignores SIGHUP without exiting', () => {
        const logger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            verbose: vi.fn(),
            child: vi.fn(),
        };
        const exit = vi.fn();
        const before = process.listeners('SIGHUP');
        const dispose = installDaemonProcessGuards({ logger, exit });
        const onSighup = addedListener('SIGHUP', before);

        onSighup();

        expect(logger.info).toHaveBeenCalledWith('SIGHUP ignored (detached daemon stays up)');
        expect(exit).not.toHaveBeenCalled();
        dispose();
    });

    it('logs uncaughtException and exits 1', () => {
        const logger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            verbose: vi.fn(),
            child: vi.fn(),
        };
        const exit = vi.fn();
        const before = process.listeners('uncaughtException');
        const dispose = installDaemonProcessGuards({ logger, exit });
        const onUncaught = addedListener('uncaughtException', before);

        onUncaught(new Error('boom'));

        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('fatal uncaughtException: '));
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('boom'));
        expect(exit).toHaveBeenCalledWith(1);
        dispose();
    });

    it('logs unhandledRejection and exits 1 once', () => {
        const logger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            verbose: vi.fn(),
            child: vi.fn(),
        };
        const exit = vi.fn();
        const beforeUnhandled = process.listeners('unhandledRejection');
        const beforeUncaught = process.listeners('uncaughtException');
        const dispose = installDaemonProcessGuards({ logger, exit });
        const onUnhandled = addedListener('unhandledRejection', beforeUnhandled);
        const onUncaught = addedListener('uncaughtException', beforeUncaught);

        onUnhandled(new Error('leaked'));
        onUncaught(new Error('second'));

        expect(exit).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('fatal unhandledRejection: '));
        dispose();
    });
});
