import * as path from 'node:path';

import { daemonFileBaseName, legacyGlobalDaemonFileBaseName } from '../daemonFileBaseName';

export function daemonLogPath(input: {
    daemonsDir: string;
    projectName: string;
    daemonId: string;
}): string {
    const base = daemonFileBaseName(input);
    return path.join(input.daemonsDir, `${base}.daemon.log`);
}

export function legacyGlobalDaemonLogPath(input: {
    daemonsDir: string;
    projectName: string;
}): string {
    return path.join(input.daemonsDir, `${legacyGlobalDaemonFileBaseName(input.projectName)}.daemon.log`);
}
