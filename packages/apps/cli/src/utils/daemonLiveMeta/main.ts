import * as fs from 'node:fs/promises';

import type { Logger } from '@lumpcode/core';

import type { LumpLine } from '../lumpLine';
import type { DaemonInFlightRun, DaemonMetaWrite } from '../readDaemonMeta';
import { formatJsonFileContent } from '../writeJsonFile';

export type DaemonLiveMetaWriter = {
    writeFingerprintAtStart: (fingerprint: string) => Promise<void>;
    beginLumpLine: (line: LumpLine) => Promise<void>;
    setContextName: (input: LumpLine & { contextName: string | null }) => Promise<void>;
    endLumpLine: (line: LumpLine) => Promise<void>;
    setTickPhase: (phase: 'idle' | 'running') => Promise<void>;
    setNextTickAt: (iso: string | undefined) => Promise<void>;
};

export type CreateDaemonLiveMetaWriterInput = {
    metaFilePath: string;
    logger: Logger;
    baseMeta: DaemonMetaWrite;
};

function sameLumpLine(a: LumpLine, b: LumpLine): boolean {
    return a.lumpName === b.lumpName && a.effectiveDiscoveryBranch === b.effectiveDiscoveryBranch;
}

function serializeInFlightRun(run: DaemonInFlightRun): DaemonInFlightRun {
    const row: DaemonInFlightRun = { lumpName: run.lumpName };
    if (run.effectiveDiscoveryBranch !== undefined) {
        row.effectiveDiscoveryBranch = run.effectiveDiscoveryBranch;
    }
    if (run.contextName !== undefined) {
        row.contextName = run.contextName;
    }
    return row;
}

function lumpLineRow(line: LumpLine): DaemonInFlightRun {
    return serializeInFlightRun({
        lumpName: line.lumpName,
        effectiveDiscoveryBranch: line.effectiveDiscoveryBranch,
    });
}

async function replaceJsonFile(filePath: string, data: unknown): Promise<void> {
    const content = formatJsonFileContent({ data, trailingNewline: true });
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmpPath, content, 'utf8');
    try {
        await fs.rename(tmpPath, filePath);
    } catch {
        try {
            await fs.unlink(filePath);
            await fs.rename(tmpPath, filePath);
        } catch (error: unknown) {
            await fs.unlink(tmpPath).catch(() => undefined);
            throw error;
        }
    }
}

export function createDaemonLiveMetaWriter(
    input: CreateDaemonLiveMetaWriterInput,
): DaemonLiveMetaWriter {
    const { metaFilePath, logger, baseMeta } = input;
    const inFlightRuns: DaemonInFlightRun[] = [];
    let tickPhase: 'idle' | 'running' | undefined;
    let nextTickAt: string | undefined;
    let localConfigFingerprint: string | undefined;
    let chain: Promise<void> = Promise.resolve();

    const persist = async (): Promise<void> => {
        const data: Record<string, unknown> = {
            ...baseMeta,
            inFlightRuns: inFlightRuns.map(serializeInFlightRun),
            inFlightLumpCount: inFlightRuns.length,
        };
        if (localConfigFingerprint !== undefined) {
            data.localConfigFingerprint = localConfigFingerprint;
        }
        if (tickPhase !== undefined) {
            data.tickPhase = tickPhase;
        }
        if (nextTickAt !== undefined) {
            data.nextTickAt = nextTickAt;
        }
        try {
            await replaceJsonFile(metaFilePath, data);
        } catch (error: unknown) {
            const message = String(error);
            logger.error(`Could not write daemon live meta: ${message}`);
            throw new Error(message);
        }
    };

    const enqueue = (run: () => Promise<void>): Promise<void> => {
        const next = chain.then(run, run);
        chain = next.then(
            () => undefined,
            () => undefined,
        );
        return next;
    };

    return {
        writeFingerprintAtStart: (fingerprint) =>
            enqueue(async () => {
                localConfigFingerprint = fingerprint;
                await persist();
            }),
        beginLumpLine: (line) =>
            enqueue(async () => {
                inFlightRuns.push(lumpLineRow(line));
                await persist();
            }),
        setContextName: (setInput) =>
            enqueue(async () => {
                const { contextName, ...line } = setInput;
                const row = inFlightRuns.find((run) => sameLumpLine(run, line));
                if (row === undefined) {
                    return;
                }
                if (contextName === null) {
                    delete row.contextName;
                } else {
                    row.contextName = contextName;
                }
                await persist();
            }),
        endLumpLine: (line) =>
            enqueue(async () => {
                const index = inFlightRuns.findIndex((run) => sameLumpLine(run, line));
                if (index !== -1) {
                    inFlightRuns.splice(index, 1);
                }
                await persist();
            }),
        setTickPhase: (phase) =>
            enqueue(async () => {
                tickPhase = phase;
                await persist();
            }),
        setNextTickAt: (iso) =>
            enqueue(async () => {
                nextTickAt = iso;
                await persist();
            }),
    };
}
