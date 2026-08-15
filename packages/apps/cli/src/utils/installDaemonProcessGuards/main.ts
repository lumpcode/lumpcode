import type { Logger } from '@lumpcode/core';

type WriteStreamHandle = {
    _handle?: { setBlocking?: (value: boolean) => void };
};

export type InstallDaemonProcessGuardsInput = {
    logger: Logger;
    /** Injectable for tests. Defaults to `process.exit`. */
    exit?: (code: number) => void;
};

function pinDaemonStdio(): void {
    for (const stream of [process.stdout, process.stderr]) {
        const handle = (stream as NodeJS.WriteStream & WriteStreamHandle)._handle;
        handle?.setBlocking?.(true);
    }
}

/**
 * Foreground-daemon process guards: blocking stdio, ignore SIGHUP, log-and-exit
 * on uncaughtException / unhandledRejection. Returns a dispose that removes
 * the signal and fatal listeners (stdio pin is left in place).
 */
export function installDaemonProcessGuards(input: InstallDaemonProcessGuardsInput): () => void {
    const {
        logger,
        exit = (code) => {
            process.exit(code);
        },
    } = input;

    pinDaemonStdio();

    const onSighup = () => {
        logger.info('SIGHUP ignored (detached daemon stays up)');
    };
    process.on('SIGHUP', onSighup);

    let exiting = false;
    const onFatal = (kind: 'uncaughtException' | 'unhandledRejection', err: unknown) => {
        if (exiting) {
            return;
        }
        exiting = true;
        const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
        logger.error(`fatal ${kind}: ${msg}`);
        exit(1);
    };
    const onUncaught = (err: unknown) => {
        onFatal('uncaughtException', err);
    };
    const onUnhandled = (err: unknown) => {
        onFatal('unhandledRejection', err);
    };
    process.on('uncaughtException', onUncaught);
    process.on('unhandledRejection', onUnhandled);

    return () => {
        process.off('SIGHUP', onSighup);
        process.off('uncaughtException', onUncaught);
        process.off('unhandledRejection', onUnhandled);
    };
}
