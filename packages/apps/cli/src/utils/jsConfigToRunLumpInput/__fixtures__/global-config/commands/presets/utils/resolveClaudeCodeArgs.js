const DEFAULT_DISALLOWED_TOOLS = ['Bash(git commit *)', 'Bash(git push *)'];

export function resolveClaudeCodeArgs({ agentPermissions = {}, model }) {
    const permissionMode = agentPermissions.permissionMode ?? 'acceptEdits';
    const args = [
        '--permission-mode',
        permissionMode,
    ];

    if (model != null && model !== '') {
        args.push('--model', model);
    }

    const disallowedTools = [
        ...DEFAULT_DISALLOWED_TOOLS,
        ...(Array.isArray(agentPermissions.disallowedTools) ? agentPermissions.disallowedTools : []),
    ];
    for (const tool of [...new Set(disallowedTools)]) {
        args.push('--disallowedTools', tool);
    }

    if (Array.isArray(agentPermissions.allowedTools)) {
        for (const tool of agentPermissions.allowedTools) {
            args.push('--allowedTools', tool);
        }
    }

    if (agentPermissions.bare === true) {
        args.push('--bare');
    }

    if (Array.isArray(agentPermissions.addDirs)) {
        for (const dir of agentPermissions.addDirs) {
            args.push('--add-dir', dir);
        }
    }

    return args;
}
