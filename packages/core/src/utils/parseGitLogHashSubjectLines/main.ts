export type GitLogHashSubjectLine = {
    hash: string;
    subject: string;
};

/** Parses `git log --format='%H %s'` lines into commit hash and subject pairs. */
export function parseGitLogHashSubjectLines(stdout: string): GitLogHashSubjectLine[] {
    return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const sp = line.indexOf(' ');
            return {
                hash: sp === -1 ? line : line.slice(0, sp),
                subject: sp === -1 ? '' : line.slice(sp + 1),
            };
        });
}
