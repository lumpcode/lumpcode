import { afterEach, describe, expect, it, vi } from 'vitest';

import { installProcessShutdown } from './main';

function testLogger() {
    return {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        verbose: vi.fn(),
        child: vi.fn(),
    };
}

describe('installProcessShutdown', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves when shutdown() is called and runs onSignal', async () => {
        const onSignal = vi.fn();
        const session = installProcessShutdown({
            logger: testLogger(),
            signalMessage: (signal) => `signal ${signal}`,
            onSignal,
        });
        session.shutdown();
        await session.promise;
        session.dispose();
        expect(onSignal).toHaveBeenCalledOnce();
    });

    it('runs onSignal when waitForShutdownOverride settles', async () => {
        const onSignal = vi.fn();
        const session = installProcessShutdown({
            logger: testLogger(),
            signalMessage: (signal) => `signal ${signal}`,
            onSignal,
            waitForShutdownOverride: async () => {},
        });
        await session.promise;
        session.dispose();
        expect(onSignal).toHaveBeenCalledOnce();
    });
});
