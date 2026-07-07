import { nodeErrnoCode } from '../nodeErrnoCode';

export type IsProcessAliveOptions = {
    onProbeError?: 'throw' | 'alive' | 'dead';
};

/** Returns whether a process id is still running (signal 0 probe). */
export function isProcessAlive(pid: number, options?: IsProcessAliveOptions): boolean {
    const onProbeError = options?.onProbeError ?? 'throw';
    try {
        process.kill(pid, 0);
        return true;
    } catch (error: unknown) {
        if (nodeErrnoCode(error) === 'ESRCH') return false;
        if (onProbeError === 'throw') throw error;
        return onProbeError === 'alive';
    }
}
