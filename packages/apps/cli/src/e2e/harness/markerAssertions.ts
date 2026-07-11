import { pollUntil } from '../../utils';

import { lumpBranchName, markerPathInRepo, remoteHasMarkerFile } from './gitHelpers';

/** Asserts the e2e completion marker file exists on the lump branch in the bare remote. */
export function expectMarkerOnRemote(input: {
    remoteDir: string;
    lumpName: string;
    contextName: string;
}): void {
    const branch = lumpBranchName(input.lumpName, input.contextName);
    const markerPath = markerPathInRepo(input.lumpName, input.contextName);
    if (!remoteHasMarkerFile({ remoteDir: input.remoteDir, branch, markerPath })) {
        throw new Error(`Missing marker ${markerPath} on ${branch}`);
    }
}

/** Polls the bare remote until `expectMarkerOnRemote` succeeds or the timeout elapses. */
export async function waitForRemoteMarker(input: {
    remoteDir: string;
    lumpName: string;
    contextName: string;
    timeoutMs?: number;
}): Promise<void> {
    await pollUntil({
        timeoutMs: input.timeoutMs ?? 90_000,
        intervalMs: 200,
        timeoutError: `Timed out waiting for marker on ${lumpBranchName(input.lumpName, input.contextName)}`,
        poll: () => { try { expectMarkerOnRemote(input); return true; } catch { return undefined; } },
    });
}
