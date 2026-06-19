export function resolveAgentPermissions({ lumpVariables = {}, stepVariables = {} }) {
    return stepVariables.agentPermissions ?? lumpVariables.agentPermissions ?? {};
}
