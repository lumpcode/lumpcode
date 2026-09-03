import {
    getGitCommitMessage,
    type LumpVariables,
    type PostSetupWorkspaceFnInput,
    type PostTeardownWorkspaceFn,
} from '@lumpcode/cli-utils';
import { execBinary } from '@lumpcode/core';

import { openGithubPr } from './github';

const LUMP_BRANCH_PREFIX = 'lump/';

export const OPEN_PR_PROVIDERS = ['github'] as const;
export type OpenPrProvider = (typeof OPEN_PR_PROVIDERS)[number];

export type OpenPrPostTeardownOptions<V extends LumpVariables = LumpVariables> = {
    provider: OpenPrProvider;
    /** Overrides the lump name parsed from `lump/<lumpName>/…` branches. */
    lumpName?: string;
    title?: (input: PostSetupWorkspaceFnInput<V>) => string;
    body?: (input: PostSetupWorkspaceFnInput<V>) => string;
};

export function openPrPostTeardown<
    V extends LumpVariables = LumpVariables,
>(options: OpenPrPostTeardownOptions<V>): PostTeardownWorkspaceFn<V> {
    const { provider, lumpName: lumpNameOption, title, body } = options;

    return async (input) => {
        const { baseBranch, branchName, contextList, workspacePath } = input;
        if (!branchName || branchName === baseBranch) {
            return;
        }

        const remote = await execBinary({
            binaryPath: 'git',
            args: ['ls-remote', '--heads', 'origin', branchName],
            cwd: workspacePath,
        });
        if (!remote.success || !remote.data.stdout.trim()) {
            return;
        }

        const names = contextList.map((ctx) => ctx.name).filter((name) => name.length > 0);
        const label = names.length > 0 ? names.join(', ') : branchName;
        const lumpName = lumpNameOption ?? lumpNameFromBranch(branchName);
        const resolvedTitle = title?.(input) ?? defaultPrTitle({ lumpName, label });
        const resolvedBody = body?.(input) ?? `LUMP contexts: ${label}`;

        await openPrWithProvider({
            provider,
            workspacePath,
            baseBranch,
            branchName,
            title: resolvedTitle,
            body: resolvedBody,
        });
    };
}

function defaultPrTitle(input: { lumpName: string | undefined; label: string }): string {
    const { lumpName, label } = input;
    if (lumpName) {
        return getGitCommitMessage({ lumpName, contextName: label });
    }
    return `LUMP: ${label}`;
}

function lumpNameFromBranch(branchName: string): string | undefined {
    if (!branchName.startsWith(LUMP_BRANCH_PREFIX)) {
        return undefined;
    }
    const rest = branchName.slice(LUMP_BRANCH_PREFIX.length);
    const slash = rest.indexOf('/');
    if (slash <= 0) {
        return undefined;
    }
    return rest.slice(0, slash);
}

async function openPrWithProvider(input: {
    provider: OpenPrProvider;
    workspacePath: string;
    baseBranch: string;
    branchName: string;
    title: string;
    body: string;
}): Promise<void> {
    const { provider, ...prInput } = input;
    switch (provider) {
        case 'github':
            await openGithubPr(prInput);
            return;
        default: {
            const _exhaustive: never = provider;
            throw new Error(`Unhandled PR provider: ${_exhaustive}`);
        }
    }
}
