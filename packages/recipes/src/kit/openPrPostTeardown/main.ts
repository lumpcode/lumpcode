import {
    getGitCommitMessage,
    type LumpVariables,
    type PostSetupWorkspaceFnInput,
    type PostTeardownWorkspaceFn,
} from '@lumpcode/cli-utils';
import { execBinary, type ContextResult } from '@lumpcode/core';

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
    /** Draft when a pushed context has `succeeded: false`. Default `true`. */
    draftOnFailure?: boolean;
};

export function openPrPostTeardown<
    V extends LumpVariables = LumpVariables,
>(options: OpenPrPostTeardownOptions<V>): PostTeardownWorkspaceFn<V> {
    const { provider, lumpName: lumpNameOption, title, body, draftOnFailure = true } = options;

    return async (input) => {
        const { baseBranch, branchName, contextList, contextResults, workspacePath } = input;
        if (!branchName || branchName === baseBranch) {
            return;
        }
        if (!branchName.startsWith(LUMP_BRANCH_PREFIX)) {
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
        const resolvedBody = body?.(input) ?? defaultPrBody({ label, contextResults });
        const draft = draftOnFailure && contextResults.some(
            (entry) => entry.outcome === 'pushed' && entry.result.succeeded === false,
        );

        await openPrWithProvider({
            provider,
            workspacePath,
            baseBranch,
            branchName,
            title: resolvedTitle,
            body: resolvedBody,
            draft,
        });
    };
}

function defaultPrBody(input: { label: string; contextResults: ContextResult[] }): string {
    const { label, contextResults } = input;
    const sections = contextResults.flatMap((entry) => {
        if (entry.outcome !== 'pushed') {
            return [];
        }
        const message = entry.result.message;
        if (message === undefined || message.length === 0) {
            return [];
        }
        return [`### ${entry.context.name}\n${message}`];
    });
    if (sections.length === 0) {
        return `LUMP contexts: ${label}`;
    }
    return sections.join('\n\n');
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
    draft: boolean;
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
