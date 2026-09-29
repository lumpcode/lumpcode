import type { Logger } from '@lumpcode/core';

import type { LumpLine } from '../lumpLine';
import type { DaemonMetaWrite } from '../readDaemonMeta';

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

export function createDaemonLiveMetaWriter(
    _input: CreateDaemonLiveMetaWriterInput,
): DaemonLiveMetaWriter {
    throw new Error('not implemented');
}
