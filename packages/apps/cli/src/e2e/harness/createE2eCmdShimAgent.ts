/** Bare executable name resolved from PATH (mimics npm-style `copilot.cmd` shims). */
export const E2E_CMD_SHIM_AGENT_BASENAME = 'e2e-cmd-agent';

/** Command module name under `.lumpcode/commands/` for a cmd-shim lump. */
export function e2eCmdShimAgentCommandModuleName(lumpName: string, cmdShimLumpNames: string[]): string {
    return cmdShimLumpNames.length > 1 && cmdShimLumpNames.includes(lumpName)
        ? `${E2E_CMD_SHIM_AGENT_BASENAME}-${lumpName}`
        : E2E_CMD_SHIM_AGENT_BASENAME;
}

/** Bare executable on PATH for the lump's cmd shim (matches the `.cmd` file basename). */
export function e2eCmdShimExecutableName(lumpName: string, cmdShimLumpNames: string[]): string {
    return e2eCmdShimAgentCommandModuleName(lumpName, cmdShimLumpNames);
}

/** Command module source: bare executable name + args (exercises Windows PATH/PATHEXT resolution). */
export function createE2eCmdShimAgentCommandModule(input: {
    lumpName: string;
    cmdShimLumpNames: string[];
}): string {
    const executable = e2eCmdShimExecutableName(input.lumpName, input.cmdShimLumpNames);
    return `export const command = ({ context, prompt }) => {
  if (!prompt) return null;
  return {
    executable: '${executable}',
    args: [context.name],
  };
};

export const setup = () => ({ contextRunState: { e2eCmdShimRan: true } });

export const teardown = () => {};
`;
}

/** Windows batch shim that writes the same e2e completion marker as the Node mock agent. */
export function createE2eCmdShimBatchFile(input: { lumpName: string }): string {
    const markerDir = `.lumpcode\\e2e-markers\\${input.lumpName}`;
    return `@echo off
setlocal
set "CONTEXT=%~1"
set "MARKER_DIR=${markerDir}"
if not exist "%MARKER_DIR%" mkdir "%MARKER_DIR%"
type nul > "%MARKER_DIR%\\%CONTEXT%.done"
exit /b 0
`;
}
