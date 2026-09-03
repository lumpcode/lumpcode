import { execBinary } from '@lumpcode/core';

const LOG_PREFIX = '[lumpcode/recipes]';

export async function openGithubPr(input: {
    workspacePath: string;
    baseBranch: string;
    branchName: string;
    title: string;
    body: string;
}): Promise<void> {
    const { workspacePath, baseBranch, branchName, title, body } = input;
    const cwd = workspacePath;

    const listed = await execBinary({
        binaryPath: 'gh',
        args: ['pr', 'list', '--head', branchName, '--base', baseBranch, '--json', 'number'],
        cwd,
    });
    if (listed.success && githubPrListHasItems(listed.data.stdout)) {
        return;
    }

    const created = await execBinary({
        binaryPath: 'gh',
        args: [
            'pr',
            'create',
            '--base',
            baseBranch,
            '--head',
            branchName,
            '--title',
            title,
            '--body',
            body,
        ],
        cwd,
    });
    if (!created.success) {
        console.error(`${LOG_PREFIX} gh pr create failed: ${created.data.message}`);
    }
}

function githubPrListHasItems(stdout: string): boolean {
    try {
        const parsed: unknown = JSON.parse(stdout);
        return Array.isArray(parsed) && parsed.length > 0;
    } catch {
        return false;
    }
}
