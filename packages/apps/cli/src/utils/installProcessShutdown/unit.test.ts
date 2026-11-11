import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSpyLogger } from '../../testing';
import { installProcessShutdown } from './main';

describe('installProcessShutdown', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves when shutdown() is called and runs onSignal', async () => {
        const onSignal = vi.fn();
        const session = installProcessShutdown({
            logger: createSpyLogger(),
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
            logger: createSpyLogger(),
            signalMessage: (signal) => `signal ${signal}`,
            onSignal,
            waitForShutdownOverride: async () => {},
        });
        await session.promise;
        session.dispose();
        expect(onSignal).toHaveBeenCalledOnce();
    });
});
