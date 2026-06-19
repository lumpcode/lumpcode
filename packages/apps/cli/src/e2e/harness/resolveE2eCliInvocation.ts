import * as fs from 'node:fs';

export type E2eCliRunner = 'sea' | 'node';

export type E2eCliInvocation = {
    runner: E2eCliRunner;
    executable: string;
    argsPrefix: string[];
};

function resolveSeaInvocation(): E2eCliInvocation {
    const fromEnv = process.env.LUMPCODE_E2E_BINARY?.trim();
    if (!fromEnv || !fs.existsSync(fromEnv)) {
        throw new Error(`LUMPCODE_E2E_BINARY missing: ${fromEnv}`);
    }
    return {
        runner: 'sea',
        executable: fromEnv,
        argsPrefix: [],
    };
}

function resolveNodeInvocation(): E2eCliInvocation {
    const entry = process.env.LUMPCODE_E2E_CLI_ENTRY?.trim();
    if (!entry || !fs.existsSync(entry)) {
        throw new Error(`LUMPCODE_E2E_CLI_ENTRY missing: ${entry}`);
    }
    return {
        runner: 'node',
        executable: process.execPath,
        argsPrefix: [entry],
    };
}

/** Resolves how to spawn the CLI in e2e: SEA binary (default) or Node via `bin/lumpcode.js`. */
export function resolveE2eCliInvocation(): E2eCliInvocation {
    if (process.env.LUMPCODE_E2E_RUNNER === 'node') {
        return resolveNodeInvocation();
    }
    return resolveSeaInvocation();
}

/** @deprecated Prefer `resolveE2eCliInvocation` — kept for callers that only need the SEA path. */
export function resolveE2eBinary(): string {
    return resolveE2eCliInvocation().executable;
}
