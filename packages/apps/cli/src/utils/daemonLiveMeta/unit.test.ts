import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { noopLogger } from '../noopLogger';
import { readDaemonMeta, type DaemonMeta, type DaemonMetaWrite } from '../readDaemonMeta';
import { createDaemonLiveMetaWriter, type DaemonLiveMetaWriter } from './main';

const baseMeta: DaemonMetaWrite = {
    daemonId: 'global',
    cronSetup: '*/5 * * * *',
    workspaceStrategy: 'checkout',
};

describe('createDaemonLiveMetaWriter (daemon-live-meta-core)', () => {
    let dir: string;
    let metaFilePath: string;
    let writer: DaemonLiveMetaWriter;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-daemon-live-meta-'));
        metaFilePath = path.join(dir, 'demo.daemon.meta.json');
        writer = createDaemonLiveMetaWriter({ metaFilePath, logger: noopLogger, baseMeta });
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    async function readMeta(): Promise<DaemonMeta> {
        const result = await readDaemonMeta(metaFilePath);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        return result.data;
    }

    async function readRaw(): Promise<Record<string, unknown>> {
        return JSON.parse(await fs.readFile(metaFilePath, 'utf8')) as Record<string, unknown>;
    }

    function assertCountInvariant(meta: DaemonMeta) {
        expect(meta.inFlightLumpCount).toBe(meta.inFlightRuns?.length ?? 0);
    }

    it('begin/end push and pop lump lines and keep inFlightLumpCount === inFlightRuns.length', async () => {
        await writer.beginLumpLine({ lumpName: 'backlog' });
        let meta = await readMeta();
        expect(meta.inFlightRuns).toEqual([{ lumpName: 'backlog' }]);
        assertCountInvariant(meta);
        expect('contextName' in ((await readRaw()).inFlightRuns as object[])[0]).toBe(false);

        await writer.endLumpLine({ lumpName: 'backlog' });
        meta = await readMeta();
        expect(meta.inFlightRuns).toEqual([]);
        assertCountInvariant(meta);
        expect(meta.daemonId).toBe('global');
        expect(meta.cronSetup).toBe('*/5 * * * *');
    });

    it('treats (lumpName, effectiveDiscoveryBranch?) as the run identity key', async () => {
        await writer.beginLumpLine({ lumpName: 'backlog', effectiveDiscoveryBranch: 'dev' });
        await writer.beginLumpLine({ lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/x' });
        let meta = await readMeta();
        expect(meta.inFlightRuns).toEqual([
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'dev' },
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/x' },
        ]);
        assertCountInvariant(meta);

        await writer.endLumpLine({ lumpName: 'backlog' });
        meta = await readMeta();
        expect(meta.inFlightRuns).toHaveLength(2);
        assertCountInvariant(meta);

        await writer.endLumpLine({ lumpName: 'backlog', effectiveDiscoveryBranch: 'dev' });
        meta = await readMeta();
        expect(meta.inFlightRuns).toEqual([
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'feature/x' },
        ]);
        assertCountInvariant(meta);
    });

    it('setContextName sets and clears contextName on the matching row (writer API only)', async () => {
        await writer.beginLumpLine({ lumpName: 'qol', effectiveDiscoveryBranch: 'dev' });
        await writer.setContextName({
            lumpName: 'qol',
            effectiveDiscoveryBranch: 'dev',
            contextName: 'ctx-a',
        });
        expect((await readMeta()).inFlightRuns).toEqual([
            { lumpName: 'qol', effectiveDiscoveryBranch: 'dev', contextName: 'ctx-a' },
        ]);

        await writer.setContextName({
            lumpName: 'qol',
            effectiveDiscoveryBranch: 'dev',
            contextName: null,
        });
        const rawRuns = (await readRaw()).inFlightRuns as object[];
        expect(rawRuns).toEqual([{ lumpName: 'qol', effectiveDiscoveryBranch: 'dev' }]);
        expect('contextName' in rawRuns[0]).toBe(false);
        assertCountInvariant(await readMeta());
    });

    it('writes tickPhase, nextTickAt, and localConfigFingerprint; omits nextTickAt when cleared', async () => {
        await writer.writeFingerprintAtStart('ab'.repeat(32));
        await writer.setTickPhase('running');
        await writer.setNextTickAt('2026-09-28T20:00:00.000Z');
        let meta = await readMeta();
        expect(meta.localConfigFingerprint).toBe('ab'.repeat(32));
        expect(meta.tickPhase).toBe('running');
        expect(meta.nextTickAt).toBe('2026-09-28T20:00:00.000Z');

        await writer.setTickPhase('idle');
        await writer.setNextTickAt(undefined);
        meta = await readMeta();
        expect(meta.tickPhase).toBe('idle');
        expect(meta.nextTickAt).toBeUndefined();
        expect('nextTickAt' in (await readRaw())).toBe(false);
        expect(meta.daemonId).toBe('global');
    });

    it('dedupes a second beginLumpLine for the same run key and keeps contextName', async () => {
        await writer.beginLumpLine({ lumpName: 'backlog' });
        await writer.setContextName({ lumpName: 'backlog', contextName: 'ctx-a' });
        await writer.beginLumpLine({ lumpName: 'backlog' });
        const meta = await readMeta();
        expect(meta.inFlightRuns).toEqual([{ lumpName: 'backlog', contextName: 'ctx-a' }]);
        assertCountInvariant(meta);
    });

    it('does not commit in-flight row when begin persist fails', async () => {
        await writer.beginLumpLine({ lumpName: 'seed' });
        await writer.endLumpLine({ lumpName: 'seed' });
        await fs.chmod(dir, 0o555);
        await expect(writer.beginLumpLine({ lumpName: 'orphan' })).rejects.toThrow();
        await fs.chmod(dir, 0o755);
        await writer.beginLumpLine({ lumpName: 'ok' });
        await writer.endLumpLine({ lumpName: 'ok' });
        const meta = await readMeta();
        expect(meta.inFlightRuns).toEqual([]);
        assertCountInvariant(meta);
    });

    it('serializes overlapping begin/end so parallel lump lines keep the count invariant', async () => {
        await Promise.all([
            writer.beginLumpLine({ lumpName: 'alpha' }),
            writer.beginLumpLine({ lumpName: 'beta', effectiveDiscoveryBranch: 'main' }),
        ]);
        let meta = await readMeta();
        expect(meta.inFlightRuns).toHaveLength(2);
        assertCountInvariant(meta);

        await Promise.all([
            writer.endLumpLine({ lumpName: 'alpha' }),
            writer.endLumpLine({ lumpName: 'beta', effectiveDiscoveryBranch: 'main' }),
        ]);
        meta = await readMeta();
        expect(meta.inFlightRuns).toEqual([]);
        assertCountInvariant(meta);
    });
});
