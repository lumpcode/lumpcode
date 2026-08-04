import * as path from 'node:path';

import { daemonFileBaseName, legacyGlobalDaemonFileBaseName } from '../daemonFileBaseName';

export function daemonMetaPath(input: {
    daemonsDir: string;
    projectName: string;
    daemonId: string;
}): string {
    const base = daemonFileBaseName(input);
    return path.join(input.daemonsDir, `${base}.daemon.meta.json`);
}

export function legacyGlobalDaemonMetaPath(input: {
    daemonsDir: string;
    projectName: string;
}): string {
    return path.join(
        input.daemonsDir,
        `${legacyGlobalDaemonFileBaseName(input.projectName)}.daemon.meta.json`,
    );
}
