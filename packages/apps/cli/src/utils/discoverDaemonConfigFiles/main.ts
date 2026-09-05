import { load as loadYaml } from 'js-yaml';

import type { Failure, Logger, Success } from '@lumpcode/core';
import { execAsync, failure, shellSingleQuote, success } from '@lumpcode/core';

import {
    daemonConfigFileSchema,
    hashDaemonConfigFile,
    type DaemonConfigFile,
} from '../daemonConfigFile';
import { DAEMON_ID_CHARSET } from '../daemonFileBaseName';

const ORIGIN_REMOTE_REF_PREFIX = 'refs/remotes/origin/';
const DAEMONS_TREE_PATH = '.lumpcode/daemons';

type DaemonConfigExtension = '.json' | '.yml' | '.yaml';

function parseDaemonConfigExtension(ext: string): DaemonConfigExtension | null {
    switch (ext) {
        case '.json':
        case '.yml':
        case '.yaml':
            return ext;
        default:
            return null;
    }
}

/** One considered repo daemon recipe after stem/ext, schema, and same-id winner rules. */
export type ConsideredDaemonConfig = {
    daemonId: string;
    /** Expand-primary entry / dedicated-line bind (same as `DedicatedLumpLine.effectiveDiscoveryBranch`). */
    effectiveDiscoveryBranch: string;
    /** Repo-root-relative POSIX path, e.g. `.lumpcode/daemons/nightly.json`. */
    path: string;
    parsed: DaemonConfigFile;
    hash: string;
};

type BranchCandidate = {
    daemonId: string;
    path: string;
    parsed: DaemonConfigFile;
    hash: string;
};

function remoteTrackingRef(effectiveDiscoveryBranch: string): string {
    return `${ORIGIN_REMOTE_REF_PREFIX}${effectiveDiscoveryBranch}`;
}

function parseDaemonConfigBasename(
    posixPath: string,
): { daemonId: string; ext: DaemonConfigExtension } | null {
    const prefix = `${DAEMONS_TREE_PATH}/`;
    if (!posixPath.startsWith(prefix)) return null;
    const base = posixPath.slice(prefix.length);
    if (base.length === 0 || base.includes('/')) return null;
    const dot = base.lastIndexOf('.');
    if (dot <= 0) return null;
    const daemonId = base.slice(0, dot);
    const ext = parseDaemonConfigExtension(base.slice(dot));
    if (ext === null) return null;
    if (!DAEMON_ID_CHARSET.test(daemonId)) return null;
    return { daemonId, ext };
}

function parseFileContents(input: {
    raw: string;
    ext: DaemonConfigExtension;
}): { ok: true; value: unknown } | { ok: false; message: string } {
    try {
        switch (input.ext) {
            case '.json':
                return { ok: true, value: JSON.parse(input.raw) };
            case '.yml':
            case '.yaml':
                return { ok: true, value: loadYaml(input.raw) };
            default: {
                const _exhaustive: never = input.ext;
                return {
                    ok: false,
                    message: `unsupported daemon config extension: ${_exhaustive}`,
                };
            }
        }
    } catch (err) {
        return {
            ok: false,
            message: err instanceof Error ? err.message : String(err),
        };
    }
}

async function listDaemonTreePaths(input: {
    cwd: string;
    ref: string;
}): Promise<Success<string[]> | Failure<string>> {
    // Trailing slash lists immediate children (top-level only); bare path returns the tree entry itself.
    const result = await execAsync(
        `git ls-tree --name-only ${shellSingleQuote(input.ref)} ${shellSingleQuote(`${DAEMONS_TREE_PATH}/`)}`,
        { cwd: input.cwd },
    );
    if (!result.success) {
        return failure(result.data.message);
    }
    return success(
        result.data.stdout
            .trim()
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
    );
}

async function showFileAtRef(input: {
    cwd: string;
    ref: string;
    posixPath: string;
}): Promise<Success<string> | Failure<string>> {
    const result = await execAsync(
        `git show ${shellSingleQuote(`${input.ref}:${input.posixPath}`)}`,
        { cwd: input.cwd },
    );
    if (!result.success) {
        return failure(result.data.message);
    }
    return success(result.data.stdout);
}

async function remoteTrackingRefExists(input: {
    cwd: string;
    ref: string;
}): Promise<boolean> {
    const result = await execAsync(`git rev-parse --verify --quiet ${shellSingleQuote(input.ref)}`, {
        cwd: input.cwd,
    });
    return result.success;
}

async function collectCandidatesOnBranch(input: {
    cwd: string;
    effectiveDiscoveryBranch: string;
    logger: Logger;
}): Promise<BranchCandidate[]> {
    const { cwd, effectiveDiscoveryBranch, logger } = input;
    const ref = remoteTrackingRef(effectiveDiscoveryBranch);

    if (!(await remoteTrackingRefExists({ cwd, ref }))) {
        logger.warn(
            `discoverDaemonConfigFiles: missing ${ref}; skipping branch "${effectiveDiscoveryBranch}"`,
        );
        return [];
    }

    const listed = await listDaemonTreePaths({ cwd, ref });
    if (!listed.success) {
        logger.warn(
            `discoverDaemonConfigFiles: ls-tree failed on "${effectiveDiscoveryBranch}": ${listed.data}; skipping`,
        );
        return [];
    }

    const byStem = new Map<string, { posixPath: string; ext: DaemonConfigExtension }[]>();
    for (const posixPath of listed.data) {
        const parsedName = parseDaemonConfigBasename(posixPath);
        if (parsedName === null) continue;
        const paths = byStem.get(parsedName.daemonId) ?? [];
        paths.push({ posixPath, ext: parsedName.ext });
        byStem.set(parsedName.daemonId, paths);
    }

    const candidates: BranchCandidate[] = [];
    for (const [daemonId, paths] of byStem) {
        if (paths.length > 1) {
            logger.error(
                `discoverDaemonConfigFiles: daemonId "${daemonId}" has multiple extensions on "${effectiveDiscoveryBranch}" (${paths.map((p) => p.posixPath).join(', ')}); considering neither`,
            );
            continue;
        }
        const { posixPath, ext } = paths[0]!;
        const shown = await showFileAtRef({ cwd, ref, posixPath });
        if (!shown.success) {
            logger.warn(
                `discoverDaemonConfigFiles: git show failed for ${posixPath} on "${effectiveDiscoveryBranch}": ${shown.data}; dropping`,
            );
            continue;
        }
        const parsedRaw = parseFileContents({ raw: shown.data, ext });
        if (!parsedRaw.ok) {
            logger.warn(
                `discoverDaemonConfigFiles: invalid ${posixPath} on "${effectiveDiscoveryBranch}": ${parsedRaw.message}; dropping`,
            );
            continue;
        }
        const schemaResult = daemonConfigFileSchema.safeParse(parsedRaw.value);
        if (!schemaResult.success) {
            logger.warn(
                `discoverDaemonConfigFiles: schema invalid for ${posixPath} on "${effectiveDiscoveryBranch}": ${schemaResult.error.message}; dropping`,
            );
            continue;
        }
        if (schemaResult.data.discoveryBranch !== effectiveDiscoveryBranch) {
            continue;
        }
        candidates.push({
            daemonId,
            path: posixPath,
            parsed: schemaResult.data,
            hash: hashDaemonConfigFile(schemaResult.data),
        });
    }
    return candidates;
}

/**
 * Reads considered daemon recipes from `refs/remotes/origin/<effectiveDiscoveryBranch>` only.
 * Does not fetch, lock, or read cwd / HEAD / local branches.
 */
export async function discoverDaemonConfigFiles(input: {
    cwd: string;
    /** `expandPrimaryBranches` result (resolved primary at index 0). */
    effectiveDiscoveryBranches: readonly string[];
    logger: Logger;
}): Promise<Success<ConsideredDaemonConfig[]>> {
    const { cwd, effectiveDiscoveryBranches, logger } = input;
    const winners = new Map<string, ConsideredDaemonConfig>();

    for (const effectiveDiscoveryBranch of effectiveDiscoveryBranches) {
        const candidates = await collectCandidatesOnBranch({
            cwd,
            effectiveDiscoveryBranch,
            logger,
        });
        for (const candidate of candidates) {
            const existing = winners.get(candidate.daemonId);
            if (existing !== undefined) {
                logger.error(
                    `discoverDaemonConfigFiles: daemonId "${candidate.daemonId}" already considered from "${existing.effectiveDiscoveryBranch}"; ignoring "${effectiveDiscoveryBranch}" (${candidate.path})`,
                );
                continue;
            }
            winners.set(candidate.daemonId, {
                daemonId: candidate.daemonId,
                effectiveDiscoveryBranch,
                path: candidate.path,
                parsed: candidate.parsed,
                hash: candidate.hash,
            });
        }
    }

    return success([...winners.values()]);
}
