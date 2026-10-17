import type { CommandOutputEvent, Logger } from '@lumpcode/core';

import type { CommandModule } from '../../types/CommandModule';
import type { OutputDetail } from '../../types/OutputDetail';
import type { PresentOutputFn } from '../../types/PresentOutputFn';
import { resolveOutputDetail } from './resolveOutputDetail';

export function formatLiveStepHeader({
    lumpName,
    contextName,
    stepIndex,
    executable,
}: {
    lumpName: string;
    contextName: string;
    stepIndex: number | number[];
    executable: string;
}): string {
    const stepLabel = Array.isArray(stepIndex) ? stepIndex.join('.') : String(stepIndex);
    return `--- ${lumpName} ${contextName} ${stepLabel} ${executable}\n`;
}

export function createLiveStepOutput({
    lumpName,
    write,
    logger,
}: {
    lumpName: string;
    write: (text: string) => void;
    logger: Pick<Logger, 'warn'>;
}): {
    onCommandOutput: (event: CommandOutputEvent) => void;
    setCommandModules: (modules: ReadonlyMap<string, CommandModule>) => void;
} {
    let modules: ReadonlyMap<string, CommandModule> = new Map();
    let presenter: PresentOutputFn | undefined;
    let outputDetail: OutputDetail = 'loud';

    const safeWrite = (text: string) => {
        if (!text) return;
        try {
            write(text);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logger.warn(`Failed to write live step output: ${message}`);
        }
    };

    const onCommandOutput = (event: CommandOutputEvent) => {
        if (event.kind === 'start') {
            safeWrite(formatLiveStepHeader({
                lumpName,
                contextName: event.contextName,
                stepIndex: event.stepIndex,
                executable: event.executable,
            }));
            presenter = undefined;
            const commandName = event.commandName;
            const factory = commandName ? modules.get(commandName)?.presentOutput : undefined;
            if (!factory) return;
            outputDetail = resolveOutputDetail({
                lumpVariables: event.lumpVariables ?? {},
                ...(event.stepVariables !== undefined ? { stepVariables: event.stepVariables } : {}),
                logger,
            });
            try {
                presenter = factory({
                    lumpVariables: event.lumpVariables ?? {},
                    ...(event.stepVariables !== undefined ? { stepVariables: event.stepVariables } : {}),
                    contextName: event.contextName,
                    stepIndex: event.stepIndex,
                    executable: event.executable,
                    ...(event.commandName !== undefined ? { commandName: event.commandName } : {}),
                });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logger.warn(`presentOutput failed to start: ${message}`);
            }
            return;
        }

        if (event.kind === 'end') {
            presenter = undefined;
            return;
        }

        if (!presenter) {
            safeWrite(event.chunk);
            return;
        }

        try {
            const presented = presenter({
                stream: event.stream,
                chunk: event.chunk,
                outputDetail,
            });
            if (typeof presented === 'string') safeWrite(presented);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logger.warn(`presentOutput failed: ${message}`);
            safeWrite(event.chunk);
        }
    };

    return {
        onCommandOutput,
        setCommandModules: (next) => {
            modules = next;
        },
    };
}
