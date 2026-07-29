export function resolveCodexArgs({ agentPermissions = {}, model }) {
    // `codex exec` options (before the `resume` subcommand).
    const execArgs = [];
    const sandbox = agentPermissions.sandbox ?? 'workspace-write';
    execArgs.push('--sandbox', sandbox);

    if (Array.isArray(agentPermissions.addDirs)) {
        for (const dir of agentPermissions.addDirs) {
            execArgs.push('--add-dir', dir);
        }
    }

    // Options accepted on both `exec` and `exec resume` — keep them on `exec`
    // so they apply before positional SESSION_ID / PROMPT.
    if (model != null && model !== '') {
        execArgs.push('--model', model);
    }

    if (agentPermissions.dangerouslyBypassApprovalsAndSandbox === true) {
        execArgs.push('--dangerously-bypass-approvals-and-sandbox');
    }

    return execArgs;
}
