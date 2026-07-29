import type { Failure, Success } from '../../types';
import { failure } from '../failure';

/**
 * Kill a process and its descendants.
 * `graceMs` default 0 → immediate SIGKILL / taskkill /T /F.
 * When `graceMs > 0`, SIGTERM first, then SIGKILL after the grace window.
 */
export async function killProcessTree(_input: {
    pid: number;
    graceMs?: number;
}): Promise<Success<void> | Failure<string>> {
    return failure('not implemented');
}
