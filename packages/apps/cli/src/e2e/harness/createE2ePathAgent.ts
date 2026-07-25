import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { windowsNpmCmdShimBody } from '@lumpcode/core';

/** Bare executable name on PATH for path-agent e2e lumps. */
export const E2E_PATH_AGENT_BASENAME = 'e2e-path-agent';

/** Repo-relative path where the path agent writes the received `-p` prompt. */
export function e2ePathAgentPromptReceivedPath(lumpName: string): string {
    return `.lumpcode/e2e-markers/${lumpName}/prompt-received.txt`;
}

/** Command module name under `.lumpcode/commands/` for a path-agent lump. */
export function e2ePathAgentCommandModuleName(lumpName: string, pathAgentLumpNames: string[]): string {
    return pathAgentLumpNames.length > 1 && pathAgentLumpNames.includes(lumpName)
        ? `${E2E_PATH_AGENT_BASENAME}-${lumpName}`
        : E2E_PATH_AGENT_BASENAME;
}

/**
 * Command module source: bare executable + `-p` prompt (same shape as agent presets).
 * Exercises PATH resolution; on Windows also npm-cmd-shim unwrap for prompt argv.
 */
export function createE2ePathAgentCommandModule(input: {
    lumpName: string;
    pathAgentLumpNames: string[];
}): string {
    const executable = e2ePathAgentCommandModuleName(input.lumpName, input.pathAgentLumpNames);
    return `export const command = ({ context, prompt }) => {
  if (!prompt) return null;
  return {
    executable: '${executable}',
    args: ['-p', prompt, context.name],
  };
};

export const setup = () => ({ contextRunState: { e2ePathAgentRan: true } });

export const teardown = () => {};
`;
}

function createE2ePathAgentScript(input: { lumpName: string; withShebang?: boolean }): string {
    const markerDir = `.lumpcode/e2e-markers/${input.lumpName}`;
    const promptPath = e2ePathAgentPromptReceivedPath(input.lumpName);
    const body = `'use strict';
const fs = require('node:fs');
const argv = process.argv.slice(2);
let prompt = '';
let contextName = '';
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '-p' && i + 1 < argv.length) {
    prompt = argv[++i];
    continue;
  }
  contextName = argv[i];
}
const markerDir = ${JSON.stringify(markerDir)};
fs.mkdirSync(markerDir, { recursive: true });
if (contextName) {
  fs.writeFileSync(markerDir + '/' + contextName + '.done', '');
}
if (prompt) {
  fs.writeFileSync(${JSON.stringify(promptPath)}, prompt);
}
`;
    return input.withShebang ? `#!/usr/bin/env node\n${body}` : body;
}

/**
 * Install a PATH agent under `agentBinDir`.
 * Windows: npm-style `.cmd` + sibling `.js` (exercises unwrap).
 * POSIX: chmod +x shebang script with the same basename.
 */
export async function installE2ePathAgent(input: {
    agentBinDir: string;
    executable: string;
    lumpName: string;
}): Promise<void> {
    const { agentBinDir, executable, lumpName } = input;
    if (process.platform === 'win32') {
        const scriptFileName = `${executable}.js`;
        await fs.writeFile(
            path.join(agentBinDir, `${executable}.cmd`),
            windowsNpmCmdShimBody(scriptFileName),
            'utf-8',
        );
        await fs.writeFile(
            path.join(agentBinDir, scriptFileName),
            createE2ePathAgentScript({ lumpName }),
            'utf-8',
        );
        return;
    }

    const posixEntry = path.join(agentBinDir, executable);
    await fs.writeFile(
        posixEntry,
        createE2ePathAgentScript({ lumpName, withShebang: true }),
        'utf-8',
    );
    await fs.chmod(posixEntry, 0o755);
}
