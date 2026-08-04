import * as path from 'node:path';

import { daemonFileBaseName } from '../daemonFileBaseName';

export function daemonPidPath(input: {
    daemonsDir: string;
    projectName: string;
    daemonId: string;
}): string {
    const base = daemonFileBaseName(input);
    return path.join(input.daemonsDir, `${base}.daemon.pid`);
}

/** Legacy bare global path (`<project>.daemon.pid`) — read/compat only. */
export function legacyBareGlobalDaemonPidPath(input: {
    daemonsDir: string;
    projectName: string;
}): string {
    return path.join(input.daemonsDir, `${input.projectName}.daemon.pid`);
}
