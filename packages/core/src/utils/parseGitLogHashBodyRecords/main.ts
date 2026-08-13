export const GIT_LOG_HASH_BODY_FORMAT = '%x1e%H%x00%B';

export type GitLogHashBodyRecord = {
    hash: string;
    message: string;
};

const RECORD_SEPARATOR = '\x1e';
const HASH_MESSAGE_SEPARATOR = '\x00';

/** Parses `git log --format='%x1e%H%x00%B'` stdout into commit hash and full-message pairs. */
export function parseGitLogHashBodyRecords(stdout: string): GitLogHashBodyRecord[] {
    const records: GitLogHashBodyRecord[] = [];
    for (const record of stdout.split(RECORD_SEPARATOR)) {
        if (!record) continue;
        const nul = record.indexOf(HASH_MESSAGE_SEPARATOR);
        if (nul === -1) continue;
        const hash = record.slice(0, nul).trim();
        if (!hash) continue;
        records.push({
            hash,
            message: record.slice(nul + 1),
        });
    }
    return records;
}
