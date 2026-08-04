import * as path from 'node:path';

import { daemonFileBaseName } from '../daemonFileBaseName';

export function daemonLogPath(input: {
    daemonsDir: string;
    projectName: string;
    daemonId: string;
}): string {
    const base = daemonFileBaseName(input);
    return path.join(input.daemonsDir, `${base}.daemon.log`);
}

/** Legacy bare global path (`<project>.daemon.log`) — read/compat only. */
export function legacyBareGlobalDaemonLogPath(input: {
    daemonsDir: string;
    projectName: string;
}): string {
    return path.join(input.daemonsDir, `${input.projectName}.daemon.log`);
}
