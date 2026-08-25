import type {
    LumpVariables,
    PostSetupWorkspaceFnInput,
    PostTeardownWorkspaceFn,
} from '@lumpcode/cli-utils';
import { execBinary } from '@lumpcode/core';

import { openGithubPr } from './github';

export const OPEN_PR_PROVIDERS = ['github'] as const;
export type OpenPrProvider = (typeof OPEN_PR_PROVIDERS)[number];

export type OpenPrPostTeardownOptions<V extends LumpVariables = LumpVariables> = {
    provider: OpenPrProvider;
    title?: (input: PostSetupWorkspaceFnInput<V>) => string;
    body?: (input: PostSetupWorkspaceFnInput<V>) => string;
};

export function openPrPostTeardown<
    V extends LumpVariables = LumpVariables,
>(options: OpenPrPostTeardownOptions<V>): PostTeardownWorkspaceFn<V> {
    const { provider, title, body } = options;

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
        const resolvedTitle = title?.(input) ?? label;
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
