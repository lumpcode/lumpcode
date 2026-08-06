export const RESERVED_DAEMON_ID = 'global';

export const DAEMON_ID_CHARSET = /^[a-zA-Z0-9_-]+$/;

export function daemonFileBaseName(input: { projectName: string; daemonId: string }): string {
    return `${input.projectName}.${input.daemonId}`;
}

/** Legacy unscoped global basename (pre daemon-id paths). */
export function legacyGlobalDaemonFileBaseName(projectName: string): string {
    return projectName;
}
