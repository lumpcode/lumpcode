export type IsProcessAliveOptions = {
    onProbeError?: 'throw' | 'alive' | 'dead';
};

/** Returns whether a process id is still running (signal 0 probe). */
export function isProcessAlive(_pid: number, _options?: IsProcessAliveOptions): boolean {
    throw new Error('not implemented');
}
