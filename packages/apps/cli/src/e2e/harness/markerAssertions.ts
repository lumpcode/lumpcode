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
    const deadline = Date.now() + (input.timeoutMs ?? 90_000);
    while (Date.now() < deadline) {
        try {
            expectMarkerOnRemote(input);
            return;
        } catch {
            await new Promise((r) => setTimeout(r, 200));
        }
    }
    throw new Error(
        `Timed out waiting for marker on ${lumpBranchName(input.lumpName, input.contextName)}`,
    );
}
