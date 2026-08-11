import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { Agent } from '@cursor/sdk';

const execFileAsync = promisify(execFile);

const LUMP_NAME = 'ideasToBacklog';
const IDEAS_FILE = 'IDEAS.yaml';

/** Load KEY=VALUE pairs from `.env` into `process.env` when unset (does not override). */
export function loadDotEnvIfPresent(projectRoot: string): void {
    const envPath = path.join(projectRoot, '.env');
    let raw: string;
    try {
        raw = fs.readFileSync(envPath, 'utf8');
    } catch {
        return;
    }
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}

function resolveCursorApiKey(): string | undefined {
    const fromEnv = process.env.CURSOR_API_KEY?.trim();
    return fromEnv || undefined;
}

export function utcDateContextName(now = new Date()): string {
    return now.toISOString().slice(0, 10);
}

export function ideasToBacklogBranchName(contextName: string): string {
    return `lump/${LUMP_NAME}/${contextName}`;
}

export function toHttpsRemoteUrl(remoteUrl: string): string {
    const trimmed = remoteUrl.trim();
    const ssh = /^git@([^:]+):(.+?)(?:\.git)?$/.exec(trimmed);
    if (ssh) {
        return `https://${ssh[1]}/${ssh[2].replace(/\.git$/, '')}`;
    }
    return trimmed.replace(/\.git$/, '');
}

async function gitStdout(args: string[], cwd: string): Promise<string> {
    const { stdout } = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
    return stdout.trim();
}

export async function remoteBranchExists(input: {
    cwd: string;
    branchName: string;
}): Promise<boolean> {
    const { cwd, branchName } = input;
    const out = await gitStdout(['ls-remote', '--heads', 'origin', branchName], cwd);
    return out.length > 0;
}

export async function ensureRemoteBranchAtHead(input: {
    cwd: string;
    branchName: string;
}): Promise<void> {
    const { cwd, branchName } = input;
    await execFileAsync('git', ['push', '-u', 'origin', `HEAD:${branchName}`], {
        cwd,
        encoding: 'utf8',
    });
}

export async function resolveOriginHttpsUrl(cwd: string): Promise<string> {
    const raw = await gitStdout(['remote', 'get-url', 'origin'], cwd);
    return toHttpsRemoteUrl(raw);
}

function buildCloudPrompt(input: { contextName: string; ideasFile: string }): string {
    const { contextName, ideasFile } = input;
    return `
You are running as the ideasToBacklog cloud agent for context ${contextName}.

Use the project skill **ideas-to-backlog** (see .agents/skills/ideas-to-backlog/SKILL.md).

Intake file: @${ideasFile}
Backlog todos: @.lumpcode/lumps/backlog/backlogItems/todo/

Your job is an interactive batch triage session: choose which ideas to promote / reject / park / spawn, clarify with me, and when I say we are done for today, update ${ideasFile} and backlog files on this branch.

IDEAS entries may include optional priority (number; lower = more important). Prefer those when proposing today's batch; when promoting, carry priority into backlog desc.yml.

Start by reading ${ideasFile} and proposing today's batch.
    `.trim();
}

/**
 * Ensures the lump branch exists on origin (pointer at current HEAD), then
 * launches a Cursor cloud agent on that branch and detaches (does not wait
 * for the interactive session to finish).
 *
 * Returns early with no agent when the remote branch already exists.
 */
export async function launchIdeasToBacklogCloudAgent(input: {
    cwd: string;
    /** Git project root (parent of `.lumpcode/`); used to load `.env`. */
    projectRoot: string;
    contextName: string;
    /** SDK model id (e.g. `grok-4.5`, `composer-2.5`) — not Cursor CLI preset slugs. Defaults to grok-4.5. */
    modelId?: string;
    /** Optional SDK model params. Defaults to effort=high, fast=true (grok-4.5 high-fast). */
    modelParams?: Array<{ id: string; value: string }>;
}): Promise<{ launched: boolean; branchName: string; reason?: string }> {
    const {
        cwd,
        projectRoot,
        contextName,
        modelId = 'grok-4.5',
        modelParams = [
            { id: 'effort', value: 'high' },
            { id: 'fast', value: 'true' },
        ],
    } = input;
    const branchName = ideasToBacklogBranchName(contextName);

    loadDotEnvIfPresent(projectRoot);
    const apiKey = resolveCursorApiKey();

    if (await remoteBranchExists({ cwd, branchName })) {
        return {
            launched: false,
            branchName,
            reason: `Remote branch ${branchName} already exists; skipping cloud agent launch`,
        };
    }

    // Auth before creating the remote branch so a missing key does not leave an open lump branch.
    if (!apiKey) {
        throw new Error(
            'No Cursor API key found. Set CURSOR_API_KEY in the environment or project `.env`, ' +
                'or run once: node -e "import(\'@cursor/sdk\').then(m => m.Cursor.auth.login())" ' +
                '(stores ~/.cursor/sdk/auth.json). Dashboard: https://cursor.com/dashboard/integrations',
        );
    }

    await ensureRemoteBranchAtHead({ cwd, branchName });

    const repoUrl = await resolveOriginHttpsUrl(cwd);
    const prompt = buildCloudPrompt({ contextName, ideasFile: IDEAS_FILE });

    const agent = await Agent.create({
        apiKey,
        model: {
            id: modelId,
            ...(modelParams && modelParams.length > 0 ? { params: modelParams } : {}),
        },
        cloud: {
            repos: [{ url: repoUrl, startingRef: branchName }],
            workOnCurrentBranch: true,
            autoCreatePR: true,
        },
        name: `ideasToBacklog Cloud Agent (${new Date().toISOString()})`,
    });

    try {
        await agent.send(prompt);
    } finally {
        await agent[Symbol.asyncDispose]();
    }

    return { launched: true, branchName };
}

export { IDEAS_FILE, LUMP_NAME };
