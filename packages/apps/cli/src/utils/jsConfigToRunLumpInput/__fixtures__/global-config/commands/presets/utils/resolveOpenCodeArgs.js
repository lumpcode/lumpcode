export function resolveOpenCodeArgs({ agentPermissions = {}, model }) {
    const args = [];

    if (model != null && model !== '') {
        args.push('-m', model);
    }

    if (agentPermissions.auto !== false) {
        args.push('--auto');
    }

    if (typeof agentPermissions.agent === 'string' && agentPermissions.agent !== '') {
        args.push('--agent', agentPermissions.agent);
    }

    return args;
}
