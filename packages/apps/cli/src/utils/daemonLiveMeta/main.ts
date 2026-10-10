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

type PersistOverrides = {
    inFlightRuns?: DaemonInFlightRun[];
    localConfigFingerprint?: string;
    tickPhase?: 'idle' | 'running';
    nextTickAt?: string | undefined;
};

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

    const persist = async (overrides?: PersistOverrides): Promise<void> => {
        const runs = overrides?.inFlightRuns ?? inFlightRuns;
        const fingerprint = overrides?.localConfigFingerprint ?? localConfigFingerprint;
        const phase = overrides?.tickPhase ?? tickPhase;
        const tickAt = overrides?.nextTickAt ?? nextTickAt;
        const data: Record<string, unknown> = {
            ...baseMeta,
            inFlightRuns: runs.map(serializeInFlightRun),
            inFlightLumpCount: runs.length,
        };
        if (fingerprint !== undefined) {
            data.localConfigFingerprint = fingerprint;
        }
        if (phase !== undefined) {
            data.tickPhase = phase;
        }
        if (tickAt !== undefined) {
            data.nextTickAt = tickAt;
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
                if (inFlightRuns.some((run) => sameLumpLine(run, line))) {
                    return;
                }
                const nextRuns = [...inFlightRuns, lumpLineRow(line)];
                await persist({ inFlightRuns: nextRuns });
                inFlightRuns.push(lumpLineRow(line));
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
                const nextRuns =
                    index === -1
                        ? [...inFlightRuns]
                        : inFlightRuns.filter((_, i) => i !== index);
                await persist({ inFlightRuns: nextRuns });
                if (index !== -1) {
                    inFlightRuns.splice(index, 1);
                }
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
