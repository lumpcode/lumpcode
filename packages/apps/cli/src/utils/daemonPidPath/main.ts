import * as path from 'node:path';

import { daemonFileBaseName, legacyGlobalDaemonFileBaseName } from '../daemonFileBaseName';

export function daemonPidPath(input: {
    daemonsDir: string;
    projectName: string;
    daemonId: string;
}): string {
    const base = daemonFileBaseName(input);
    return path.join(input.daemonsDir, `${base}.daemon.pid`);
}

export function legacyGlobalDaemonPidPath(input: {
    daemonsDir: string;
    projectName: string;
}): string {
    return path.join(input.daemonsDir, `${legacyGlobalDaemonFileBaseName(input.projectName)}.daemon.pid`);
}
