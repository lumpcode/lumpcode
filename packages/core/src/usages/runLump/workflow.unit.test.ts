import { execSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { load as loadYaml } from 'js-yaml';

import type { CommandDescriptor, CommandFn, CommandOutputEvent, ContextResult, WorkflowFn } from '../../types';
import { getContextStatus } from '../../helpers/getContextStatus';
import { shellSingleQuote } from '../../utils';
import {
    probeAlive,
    waitForPidGone,
    waitForReadyFile,
} from '../../testing/processTreeTestHelpers';
import {
    recordingGitFns,
    stubBranchFn,
    stubGitAddCommit,
    stubGitCommitMessage,
    stubGitPush,
} from '../../helpers/executeStepsForContextList/testing/testHelpers';
import {
    defaultGitAddCommitFn,
    defaultGitCommitMessageFn,
    defaultGitPushFn,
} from './defaultInjectedFns';
import { runLump } from './main';

function hangCommand(ready: string): CommandDescriptor {
    const script = `
        const fs = require('node:fs');
        fs.writeFileSync(${JSON.stringify(ready)}, JSON.stringify({ pids: [process.pid] }) + '\\n');
        setInterval(() => {}, 1000);
    `;
    return { executable: process.execPath, args: ['-e', script] };
}

describe('runLump workflow', () => {
    let projectRoot: string;
    let remoteDir: string | undefined;
    const activePids = new Set<number>();

    function common(extra: Record<string, unknown> = {}) {
        return {
            projectRoot,
            baseBranch: 'main',
            branchFn: stubBranchFn,
            getContextListFn: async () => [{ name: 'ctx', variables: {} }],
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            gitAddCommitFn: stubGitAddCommit,
            gitPushFn: stubGitPush,
            gitCommitMessageFn: stubGitCommitMessage,
            getKeepHistoryFilePathFn: () => undefined as string | undefined,
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => '',
            ...extra,
        };
    }

    function captured(extra: Record<string, unknown> = {}) {
        const seen = { setup: [] as ContextResult[], teardown: [] as ContextResult[] };
        return {
            seen,
            input: {
                ...common(extra),
                setupWorkspaceFn: async (hookInput: { contextResults: ContextResult[] }) => {
                    seen.setup = [...hookInput.contextResults];
                    return { command: '', workspacePath: projectRoot };
                },
                teardownWorkspaceFn: async (hookInput: { contextResults: ContextResult[] }) => {
                    seen.teardown = [...hookInput.contextResults];
                    return '';
                },
            },
        };
    }

    async function attachRemote() {
        remoteDir = await mkdtemp(join(tmpdir(), 'workflow-remote-'));
        execSync('git init --bare', { cwd: remoteDir, stdio: 'pipe' });
        execSync(`git remote add origin ${shellSingleQuote(remoteDir)}`, { cwd: projectRoot, stdio: 'pipe' });
        execSync('git push -u origin main', { cwd: projectRoot, stdio: 'pipe' });
    }

    async function runReal(workflow: WorkflowFn) {
        await attachRemote();
        const seen = { setup: [] as ContextResult[], teardown: [] as ContextResult[] };
        const result = await runLump({
            ...common(),
            gitAddCommitFn: defaultGitAddCommitFn,
            gitPushFn: defaultGitPushFn,
            gitCommitMessageFn: defaultGitCommitMessageFn,
            setupWorkspaceFn: async (hookInput: { branchName: string; contextResults: ContextResult[] }) => {
                seen.setup = [...hookInput.contextResults];
                return {
                    command: `git switch -C ${shellSingleQuote(hookInput.branchName)}`,
                    workspacePath: projectRoot,
                };
            },
            teardownWorkspaceFn: async (hookInput: { contextResults: ContextResult[] }) => {
                seen.teardown = [...hookInput.contextResults];
                return 'git switch main';
            },
            workflow,
        });
        return { result, seen };
    }

    async function contextStatus(contextName = 'ctx') {
        return getContextStatus({
            contextName,
            gitCommitMessageFn: defaultGitCommitMessageFn,
            projectRoot,
            baseBranch: 'main',
        });
    }

    beforeEach(async () => {
        projectRoot = await mkdtemp(join(tmpdir(), 'workflow-run-'));
        execSync(
            'git init -b main && git config user.email "test@test.com" && git config user.name "Test" && git commit --allow-empty -m "init"',
            { cwd: projectRoot, stdio: 'pipe' },
        );
    });

    afterEach(async () => {
        for (const pid of activePids) {
            try {
                process.kill(pid, 'SIGKILL');
            } catch {
                // already gone
            }
        }
        activePids.clear();
        await rm(projectRoot, { recursive: true, force: true });
        if (remoteDir) {
            await rm(remoteDir, { recursive: true, force: true });
            remoteDir = undefined;
        }
    });

    it('rejects workflow together with steps before either runs', async () => {
        let ran = false;
        const result = await runLump({
            ...common(),
            steps: [{
                commandFn: () => {
                    ran = true;
                    return { executable: 'echo', args: ['no'] };
                },
            }],
            workflow: async () => {
                ran = true;
            },
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.data.message).toContain('Use workflow or steps, not both.');
        expect(ran).toBe(false);
    });

    it('runs shell, commits, pushes, and leaves the context branchPushed', async () => {
        const { result, seen } = await runReal(async ({ shell }) => {
            const ran = await shell('echo ok');
            expect(ran.succeeded).toBe(true);
            expect(ran.output).toContain('ok');
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.result.contextResults).toEqual([
            expect.objectContaining({
                outcome: 'pushed',
                result: expect.objectContaining({ succeeded: true, push: true }),
            }),
        ]);
        expect(seen.setup).toEqual([]);
        expect(seen.teardown.map((entry) => entry.outcome)).toEqual(['pushed']);
        expect(await contextStatus()).toBe('branchPushed');
    });

    it('still pushes when the workflow reports succeeded false', async () => {
        const { result, seen } = await runReal(async () => ({
            succeeded: false,
            message: 'tests still red',
        }));

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.result.contextResults?.[0]).toMatchObject({
            outcome: 'pushed',
            result: { succeeded: false, push: true, message: 'tests still red' },
        });
        expect(seen.teardown[0]?.result.message).toBe('tests still red');
        expect(await contextStatus()).toBe('branchPushed');
    });

    it('normalizes an empty object the same way as a void return', async () => {
        const events: string[] = [];
        const { seen, input } = captured({
            ...recordingGitFns(events),
            workflow: async () => ({}),
        });
        const result = await runLump(input);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.result.contextResults?.[0]).toMatchObject({
            outcome: 'pushed',
            result: { succeeded: true, push: true },
        });
        expect(seen.setup).toEqual([]);
        expect(events).toEqual(expect.arrayContaining(['gitAddCommit', 'gitPush']));
    });

    it('does not commit or push when push is false', async () => {
        const events: string[] = [];
        const { seen, input } = captured({
            ...recordingGitFns(events),
            workflow: async () => ({ push: false, message: 'hold' }),
        });
        const result = await runLump(input);

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.data.reason).toBe('workflowNotPushed');
        expect(result.data.message).toContain('hold');
        expect(result.data.contextResults?.[0]).toMatchObject({
            outcome: 'notPushed',
            result: { succeeded: true, push: false, message: 'hold' },
        });
        expect(seen.teardown[0]?.outcome).toBe('notPushed');
        expect(events).not.toContain('gitAddCommit');
        expect(events).not.toContain('gitPush');
        expect(await contextStatus()).toBe('toDo');
    });

    it('stays toDo when the workflow throws', async () => {
        const events: string[] = [];
        const { seen, input } = captured({
            ...recordingGitFns(events),
            workflow: async () => {
                throw new Error('boom');
            },
        });
        const result = await runLump(input);

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.data.reason).toBe('workflowThrew');
        expect(result.data.message).toContain('boom');
        expect(result.data.contextResults?.[0]).toMatchObject({
            outcome: 'failed',
            result: { succeeded: false, push: false },
        });
        expect(result.data.contextResults?.[0]?.result.message).toContain('boom');
        expect(seen.teardown[0]?.outcome).toBe('failed');
        expect(events).not.toContain('gitAddCommit');
        expect(await contextStatus()).toBe('toDo');
    });

    it('a failing shell returns a result and the workflow can still push', async () => {
        const events: string[] = [];
        const result = await runLump({
            ...common({ ...recordingGitFns(events) }),
            workflow: async ({ shell }) => {
                const failed = await shell('exit 4');
                expect(failed.succeeded).toBe(false);
                expect(failed.exitCode).toBe(4);
                expect(failed.timedOut).toBe(false);
            },
        });

        expect(result.success).toBe(true);
        expect(events).toContain('gitPush');
    });

    it('takes the abort path when the run signal aborts', async () => {
        const ready = join(projectRoot, 'abort.json');
        const events: string[] = [];
        const controller = new AbortController();
        const { seen, input } = captured({
            ...recordingGitFns(events),
            signal: controller.signal,
            workflow: async ({ shell }) => {
                await shell(hangCommand(ready));
            },
        });
        const resultPromise = runLump(input);
        const { pids } = await waitForReadyFile(ready);
        for (const pid of pids) activePids.add(pid);
        controller.abort();

        const result = await resultPromise;
        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.data.reason).toBe('stepWalkFailed');
        expect(result.data.contextResults?.[0]?.outcome).toBe('aborted');
        expect(seen.teardown[0]?.outcome).toBe('aborted');
        expect(events).not.toContain('gitAddCommit');
        expect(await contextStatus()).toBe('toDo');
        for (const pid of pids) {
            await waitForPidGone(pid);
            expect(probeAlive(pid)).toBe(false);
            activePids.delete(pid);
        }
    });

    it('aborts a workflow that exceeds timeoutMillis', async () => {
        const ready = join(projectRoot, 'deadline.json');
        const events: string[] = [];
        const { input } = captured({
            ...recordingGitFns(events),
            timeoutMillis: 2000,
            workflow: async ({ shell }) => {
                await shell(hangCommand(ready));
            },
        });
        const resultPromise = runLump(input);
        const { pids } = await waitForReadyFile(ready);
        for (const pid of pids) activePids.add(pid);

        const result = await resultPromise;
        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.data.reason).toBe('stepWalkFailed');
        expect(result.data.reason).not.toBe('workflowThrew');
        expect(result.data.contextResults?.[0]?.outcome).toBe('aborted');
        expect(events).not.toContain('gitAddCommit');
        for (const pid of pids) {
            await waitForPidGone(pid);
            expect(probeAlive(pid)).toBe(false);
            activePids.delete(pid);
        }
    });

    it('records shell and workflow history, variables, and output events', async () => {
        const info: string[] = [];
        const events: CommandOutputEvent[] = [];
        const historyPath = join(projectRoot, 'history.yaml');
        const result = await runLump({
            ...common({
                getKeepHistoryFilePathFn: () => historyPath,
                onCommandOutput: (event: CommandOutputEvent) => { events.push(event); },
                logger: {
                    error: () => {},
                    warn: () => {},
                    info: (message: string) => { info.push(message); },
                    verbose: () => {},
                    child() { return this; },
                },
            }),
            workflow: async ({ shell, log }) => {
                log('working');
                await shell('echo ok');
                return { message: 'done', variables: { marker: 'from-workflow' } };
            },
        });

        expect(result.success).toBe(true);
        expect(info).toContain('working');
        expect(events).toContainEqual({ kind: 'log', contextName: 'ctx', message: 'working' });

        const start = events.find((event) => event.kind === 'start');
        expect(start).toMatchObject({
            kind: 'start',
            callKind: 'shell',
            label: 'echo ok',
            executable: 'sh',
            stepIndex: [0, 1],
        });
        expect(events.some((event) => event.kind === 'chunk' && event.chunk.includes('ok'))).toBe(true);
        const end = events.find((event) => event.kind === 'end');
        expect(end).toMatchObject({ kind: 'end', succeeded: true, exitCode: 0, timedOut: false });

        const workflowEnd = events.find((event) => event.kind === 'workflowEnd');
        expect(workflowEnd && workflowEnd.kind === 'workflowEnd' && workflowEnd.result).toMatchObject({
            succeeded: true,
            push: true,
            message: 'done',
            variables: { marker: 'from-workflow' },
        });

        const history = loadYaml(await readFile(historyPath, 'utf8')) as Array<Record<string, unknown>>;
        const shellEntry = history.find((entry) => entry.kind === 'shell');
        const workflowEntry = history.at(-1);
        expect(shellEntry).toMatchObject({
            kind: 'shell',
            label: 'echo ok',
            command: 'echo ok',
            stepIndex: [0, 1],
        });
        expect(String(shellEntry?.commandResult)).toContain('ok');
        expect(workflowEntry).toMatchObject({
            kind: 'workflow',
            stepIndex: 0,
            stepVariables: { marker: 'from-workflow' },
            workflowResult: {
                succeeded: true,
                push: true,
                message: 'done',
                variables: { marker: 'from-workflow' },
            },
        });
    });

    it('gives parallel shells distinct indexes', async () => {
        const events: CommandOutputEvent[] = [];
        const result = await runLump({
            ...common({
                onCommandOutput: (event: CommandOutputEvent) => { events.push(event); },
            }),
            workflow: async ({ shell }) => {
                const [first, second] = await Promise.all([
                    shell('echo A'),
                    shell('echo B'),
                ]);
                expect(first.output).toContain('A');
                expect(second.output).toContain('B');
            },
        });

        expect(result.success).toBe(true);
        expect(events.filter((event) => event.kind === 'start').map((event) => (
            event.kind === 'start' ? event.stepIndex : undefined
        ))).toEqual([[0, 1], [0, 2]]);
    });

    it('runs a default-agent prompt through the executor', async () => {
        const historyPath = join(projectRoot, 'history.yaml');
        const commandFn: CommandFn = ({ prompt, sessionId }) => {
            expect(sessionId).toMatch(/^[0-9a-f-]{36}$/i);
            return { executable: 'echo', args: [prompt] };
        };
        commandFn.commandName = 'echo-agent';
        const result = await runLump({
            ...common({ getKeepHistoryFilePathFn: () => historyPath }),
            workflow: async ({ agent }) => {
                const session = await agent.session(commandFn);
                const prompted = await session.prompt('hello');
                expect(prompted.succeeded).toBe(true);
                expect(prompted.output).toContain('hello');
                expect(session.command).toBe('echo-agent');
            },
        });

        expect(result.success).toBe(true);
        const history = loadYaml(await readFile(historyPath, 'utf8')) as Array<Record<string, unknown>>;
        expect(history.find((entry) => entry.kind === 'prompt')).toMatchObject({
            kind: 'prompt',
            command: 'echo-agent',
            stepIndex: [0, 1],
            label: 'hello',
        });
    });

    it('records a host agent prompt from runAgentCall', async () => {
        const historyPath = join(projectRoot, 'history.yaml');
        const events: CommandOutputEvent[] = [];
        const commandFn: CommandFn = () => ({ executable: 'echo', args: ['from-host'] });
        commandFn.commandName = 'host-agent';
        const result = await runLump({
            ...common({
                getKeepHistoryFilePathFn: () => historyPath,
                onCommandOutput: (event: CommandOutputEvent) => { events.push(event); },
            }),
            createAgent: ({ runAgentCall }) => ({
                async session() {
                    return {
                        command: 'host-agent',
                        sessionId: 'host-session',
                        prompt: (text: string) => runAgentCall({
                            commandFn,
                            commandName: 'host-agent',
                            prompt: text,
                            sessionId: 'host-session',
                            stepVariables: { model: 'auto' },
                            label: 'host prompt',
                        }),
                    };
                },
                async prompt() {
                    throw new Error('unused');
                },
            }),
            workflow: async ({ agent }) => {
                const session = await agent.session();
                await session.prompt('implement it');
            },
        });

        expect(result.success).toBe(true);
        const history = loadYaml(await readFile(historyPath, 'utf8')) as Array<Record<string, unknown>>;
        expect(history.find((entry) => entry.kind === 'prompt')).toMatchObject({
            kind: 'prompt',
            label: 'host prompt',
            command: 'host-agent',
            sessionId: 'host-session',
            stepIndex: [0, 1],
            stepVariables: { model: 'auto' },
        });
        const start = events.find((event) => event.kind === 'start');
        expect(start).toMatchObject({
            kind: 'start',
            callKind: 'prompt',
            sessionId: 'host-session',
            label: 'host prompt',
        });
    });

    it('records one context result per context, in run order', async () => {
        const events: string[] = [];
        const { seen, input } = captured({
            ...recordingGitFns(events),
            numberOfContextsPerBranch: 2,
            getContextListFn: async () => [
                { name: 'one', variables: {} },
                { name: 'two', variables: {} },
            ],
            workflow: async ({ context }) => ({ message: context.name }),
        });
        const result = await runLump(input);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.result.contextResults?.map((entry) => entry.context.name)).toEqual(['one', 'two']);
        expect(result.data.result.contextResults?.map((entry) => entry.result.message)).toEqual(['one', 'two']);
        expect(result.data.result.contextResults?.every((entry) => entry.outcome === 'pushed')).toBe(true);
        expect(seen.setup).toEqual([]);
        expect(seen.teardown.map((entry) => entry.context.name)).toEqual(['one', 'two']);
        expect(events.filter((event) => event === 'gitAddCommit')).toHaveLength(2);
        expect(events.filter((event) => event === 'gitPush')).toHaveLength(1);
    });

    it('records a pushed context result for a steps lump and leaves kind off the history entry', async () => {
        const historyPath = join(projectRoot, 'history.yaml');
        const { seen, input } = captured({
            getKeepHistoryFilePathFn: () => historyPath,
            steps: [{
                promptFn: () => 'say ok',
                commandFn: () => ({ executable: 'echo', args: ['ok'] }),
            }],
        });
        const result = await runLump(input);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.result.contextResults).toEqual([
            expect.objectContaining({
                outcome: 'pushed',
                result: { succeeded: true, push: true },
            }),
        ]);
        expect(seen.teardown[0]?.result).toEqual({ succeeded: true, push: true });
        const history = loadYaml(await readFile(historyPath, 'utf8')) as Array<Record<string, unknown>>;
        expect(history[0]?.kind).toBeUndefined();
        expect(String(history[0]?.commandResult)).toContain('ok');
        expect(history[0]?.prompt).toBe('say ok');
    });

    it('records the step-walk failure on a steps lump context result', async () => {
        const events: string[] = [];
        const { seen, input } = captured({
            ...recordingGitFns(events),
            steps: [{
                commandFn: () => ({ executable: 'sh', args: ['-c', 'exit 1'] }),
            }],
        });
        const result = await runLump(input);

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.data.reason).toBe('stepWalkFailed');
        expect(result.data.contextResults?.[0]?.outcome).toBe('failed');
        expect(result.data.contextResults?.[0]?.result.succeeded).toBe(false);
        expect(result.data.contextResults?.[0]?.result.push).toBe(false);
        expect(result.data.contextResults?.[0]?.result.message).toContain('Failed to run the command');
        expect(seen.teardown[0]?.result.message).toContain('Failed to run the command');
        expect(events).not.toContain('gitAddCommit');
    });

    it('keeps the 30 minute default for a steps lump', async () => {
        const source = await readFile(
            new URL('../../helpers/executeStepsForContextList/main.ts', import.meta.url),
            'utf8',
        );
        expect(source).toMatch(/timeoutMillis = 1000 \* 60 \* 30/);

        const result = await runLump({
            ...common(),
            steps: [{
                commandFn: () => ({ executable: 'echo', args: ['still-steps'] }),
            }],
        });
        expect(result.success).toBe(true);
    });
});
