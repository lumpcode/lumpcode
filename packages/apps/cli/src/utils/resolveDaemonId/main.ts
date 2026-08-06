import { randomBytes } from 'node:crypto';

import { failure, success, type Failure, type Success } from '@lumpcode/core';

import { DAEMON_ID_CHARSET, RESERVED_DAEMON_ID } from '../daemonFileBaseName';
import {
    isLumpNameFilterActive,
    isLumpNameGlobPattern,
    type LumpNameFilter,
} from '../filterLumpNames';

function allocateUniqueId(preferred: string, existing: ReadonlySet<string>): string {
    if (!existing.has(preferred)) {
        return preferred;
    }
    let n = 2;
    while (existing.has(`${preferred}-${n}`)) {
        n += 1;
    }
    return `${preferred}-${n}`;
}

function randomDaemonId(existing: ReadonlySet<string>): Success<string> | Failure<string> {
    for (let attempt = 0; attempt < 32; attempt += 1) {
        const id = `d-${randomBytes(3).toString('hex')}`;
        if (!existing.has(id)) {
            return success(id);
        }
    }
    return failure('Could not allocate a unique random daemon id');
}

export function resolveDaemonId(input: {
    explicitDaemonId?: string;
    filter: LumpNameFilter;
    existingDaemonIds: ReadonlySet<string>;
}): Success<string> | Failure<string> {
    const { explicitDaemonId, filter, existingDaemonIds } = input;
    const filtered = isLumpNameFilterActive(filter);
    const explicit = explicitDaemonId?.trim() || undefined;

    if (explicit !== undefined) {
        if (!DAEMON_ID_CHARSET.test(explicit)) {
            return failure(`Invalid --daemonId "${explicit}": must match [a-zA-Z0-9_-]+.`);
        }
        if (explicit === RESERVED_DAEMON_ID && filtered) {
            return failure(
                `Daemon id "${RESERVED_DAEMON_ID}" is reserved for an unfiltered daemon; omit filters or choose another --daemonId.`,
            );
        }
        if (existingDaemonIds.has(explicit)) {
            return failure(
                `Daemon id "${explicit}" is already in use. Stop it first or choose another --daemonId.`,
            );
        }
        return success(explicit);
    }

    if (!filtered) {
        if (existingDaemonIds.has(RESERVED_DAEMON_ID)) {
            return failure(
                `Daemon id "${RESERVED_DAEMON_ID}" is already in use. Stop it first or pass --daemonId for another full-queue daemon.`,
            );
        }
        return success(RESERVED_DAEMON_ID);
    }

    const include = filter.include ?? [];
    const singleExactNoExclude =
        include.length === 1 &&
        !isLumpNameGlobPattern(include[0]!) &&
        !(filter.exclude?.length);

    if (singleExactNoExclude) {
        const name = include[0]!;
        if (name === RESERVED_DAEMON_ID) {
            return failure(
                `Cannot auto-assign daemon id "${RESERVED_DAEMON_ID}" for a filtered daemon (lump name conflicts with the reserved id). Pass --daemonId.`,
            );
        }
        if (!DAEMON_ID_CHARSET.test(name)) {
            return failure(
                `Cannot use lump name "${name}" as daemon id (invalid charset). Pass --daemonId.`,
            );
        }
        return success(allocateUniqueId(name, existingDaemonIds));
    }

    return randomDaemonId(existingDaemonIds);
}
