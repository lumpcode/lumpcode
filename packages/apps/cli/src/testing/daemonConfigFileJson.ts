import type { DaemonConfigFile } from '../utils/daemonConfigFile';

/** Pretty-printed `.lumpcode/daemons/<id>.json` body for integration fixtures. */
export function daemonConfigFileJson(
    discoveryBranch: string,
    extra: Omit<DaemonConfigFile, 'discoveryBranch'> = {},
): string {
    return `${JSON.stringify({ discoveryBranch, ...extra }, null, 2)}\n`;
}
