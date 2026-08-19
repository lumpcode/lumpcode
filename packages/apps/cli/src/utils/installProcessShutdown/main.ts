import type { Logger } from '@lumpcode/core';

export type InstallProcessShutdownInput = {
    logger: Logger;
    signalMessage: (signal: NodeJS.Signals) => string;
    onSignal?: (signal?: NodeJS.Signals) => void | Promise<void>;
    waitForShutdownOverride?: () => Promise<void>;
};

export type ProcessShutdown = {
    promise: Promise<void>;
    shutdown: () => void;
    dispose: () => void;
};

/**
 * Resolves after `onSignal` when SIGINT/SIGTERM fires, `shutdown()` is called,
 * or `waitForShutdownOverride` settles. `onSignal` runs for every path.
 */
export function installProcessShutdown(input: InstallProcessShutdownInput): ProcessShutdown {
    let settled = false;
    let resolveNative = () => {};
    const nativePromise = new Promise<void>((resolve) => {
        resolveNative = resolve;
    });

    const beginShutdown = (signal?: NodeJS.Signals) => {
        if (settled) {
            return;
        }
        settled = true;
        process.off('SIGINT', onProcessSignal);
        process.off('SIGTERM', onProcessSignal);
        if (signal !== undefined) {
            input.logger.info(input.signalMessage(signal));
        }
        void Promise.resolve(input.onSignal?.(signal)).finally(resolveNative);
    };

    const onProcessSignal = (signal: NodeJS.Signals) => {
        beginShutdown(signal);
    };

    process.on('SIGINT', onProcessSignal);
    process.on('SIGTERM', onProcessSignal);

    if (input.waitForShutdownOverride) {
        void input.waitForShutdownOverride().then(() => {
            beginShutdown();
        });
    }

    return {
        promise: nativePromise,
        shutdown: () => {
            beginShutdown();
        },
        dispose: () => {
            process.off('SIGINT', onProcessSignal);
            process.off('SIGTERM', onProcessSignal);
        },
    };
}
