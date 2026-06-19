const DEFAULT_DENY_SHELL = ['shell(git commit)', 'shell(git push)'];

export function resolveCopilotToolArgs({ agentPermissions }) {
    const args = [];
    const writablePaths = agentPermissions?.writablePaths;
    const hasWritablePaths = Array.isArray(writablePaths) && writablePaths.length > 0;

    if (hasWritablePaths) {
        args.push('--allow-tool=read');
        for (const glob of writablePaths) {
            args.push(`--allow-tool=write(${glob})`);
        }
        args.push('--allow-tool=shell(*)');
    } else {
        args.push('--allow-all-tools');
    }

    const denyShell = [
        ...DEFAULT_DENY_SHELL,
        ...(Array.isArray(agentPermissions?.denyShell) ? agentPermissions.denyShell : []),
    ];
    for (const tool of [...new Set(denyShell)]) {
        args.push(`--deny-tool=${tool}`);
    }

    return args;
}
