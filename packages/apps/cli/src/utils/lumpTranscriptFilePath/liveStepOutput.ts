import type { CommandOutputEvent, Logger } from '@lumpcode/core';

import type { CommandModule } from '../../types/CommandModule';
import type { OutputDetail } from '../../types/OutputDetail';
import type { PresentOutputFn } from '../../types/PresentOutputFn';
import { resolveOutputDetail } from './resolveOutputDetail';

function stepLabelOf(stepIndex: number | number[]): string {
    return Array.isArray(stepIndex) ? stepIndex.join('.') : String(stepIndex);
}

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
    return `--- ${lumpName} ${contextName} ${stepLabelOf(stepIndex)} ${executable}\n`;
}

function formatWorkflowCallHeader(event: Extract<CommandOutputEvent, { kind: 'start' }>): string {
    const stepLabel = stepLabelOf(event.stepIndex);
    const label = event.label ?? '';
    if (event.callKind === 'shell') {
        return `── ${event.contextName} · ${stepLabel} shell · ${label} ──\n`;
    }
    const command = event.commandName ?? event.executable;
    const sessionPrefix = (event.sessionId ?? '').slice(0, 8);
    return `── ${event.contextName} · ${stepLabel} prompt · ${label} (${command}, session ${sessionPrefix}…) ──\n`;
}

function formatWorkflowEnd(event: Extract<CommandOutputEvent, { kind: 'workflowEnd' }>): string {
    const status = event.result.succeeded ? 'succeeded' : 'failed';
    const pushed = event.result.push ? 'pushed' : 'not pushed';
    const message = event.result.message ?? '';
    return `══ ${event.contextName} · workflow: ${status}, ${pushed} · "${message}" ══\n`;
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
    let workflowCall = false;

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
        if (event.kind === 'log') {
            safeWrite(`· log: ${event.message}\n`);
            return;
        }

        if (event.kind === 'workflowEnd') {
            safeWrite(formatWorkflowEnd(event));
            return;
        }

        if (event.kind === 'start') {
            workflowCall = event.callKind === 'prompt' || event.callKind === 'shell';
            safeWrite(workflowCall
                ? formatWorkflowCallHeader(event)
                : formatLiveStepHeader({
                    lumpName,
                    contextName: event.contextName,
                    stepIndex: event.stepIndex,
                    executable: event.executable,
                }));
            presenter = undefined;
            if (event.callKind === 'shell') return;
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
            if (workflowCall && event.succeeded === false) {
                safeWrite(event.timedOut ? '✗ timed out\n' : `✗ exit ${event.exitCode}\n`);
            }
            presenter = undefined;
            workflowCall = false;
            return;
        }

        if (event.kind !== 'chunk') {
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
