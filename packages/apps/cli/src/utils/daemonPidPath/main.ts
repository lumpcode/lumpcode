import * as path from 'node:path';

import { daemonFileBaseName } from '../daemonFileBaseName';

export function daemonPidPath(input: {
    daemonsDir: string;
    projectName: string;
    lumpName?: string;
}): string {
    const base = daemonFileBaseName(input);
    return path.join(input.daemonsDir, `${base}.daemon.pid`);
}
