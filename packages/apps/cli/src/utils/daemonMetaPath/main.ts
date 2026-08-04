import * as path from 'node:path';

import { daemonFileBaseName } from '../daemonFileBaseName';

export function daemonMetaPath(input: {
    daemonsDir: string;
    projectName: string;
    daemonId: string;
}): string {
    const base = daemonFileBaseName(input);
    return path.join(input.daemonsDir, `${base}.daemon.meta.json`);
}

/** Legacy bare global path (`<project>.daemon.meta.json`) — read/compat only. */
export function legacyBareGlobalDaemonMetaPath(input: {
    daemonsDir: string;
    projectName: string;
}): string {
    return path.join(input.daemonsDir, `${input.projectName}.daemon.meta.json`);
}
