import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
    CommandDescriptor,
    CommandFn,
    CommandOutputEvent,
    CreateAgentInput,
    Logger,
    StepVariables,
} from '../../types';
import {
    probeAlive,
    waitForPidGone,
    waitForReadyFile,
} from '../../testing/processTreeTestHelpers';
import { createWorkflowRuntime, type CreateWorkflowRuntimeInput } from './main';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TWO_HOURS = 2 * 60 * 60 * 1000;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function holdCommand(ready: string, release: string, token: string): CommandDescriptor {
    const script = `
        const fs = require('node:fs');
        process.stdout.write(${JSON.stringify(`${token}-1\n`)});
        fs.writeFileSync(${JSON.stringify(ready)}, JSON.stringify({ pids: [process.pid] }) + '\\n');
        const timer = setInterval(() => {
            if (fs.existsSync(${JSON.stringify(release)})) {
                clearInterval(timer);
                process.stdout.write(${JSON.stringify(`${token}-2\n`)});
            }
        }, 20);
    `;
    return { executable: process.execPath, args: ['-e', script] };
}

function hangCommand(ready: string): CommandDescriptor {
    const script = `
        const fs = require('node:fs');
        fs.writeFileSync(${JSON.stringify(ready)}, JSON.stringify({ pids: [process.pid] }) + '\\n');
        setInterval(() => {}, 1000);
    `;
    return { executable: process.execPath, args: ['-e', script] };
}

function makeCommand(
    commandName: string,
    seen: Array<{ prompt: string; sessionId?: string; stepVariables?: StepVariables }> = [],
): CommandFn {
    const commandFn: CommandFn = (input) => {
        seen.push({
            prompt: input.prompt,
            sessionId: input.sessionId,
            stepVariables: input.stepVariables,
        });
        return { executable: 'echo', args: [input.prompt] };
    };
    commandFn.commandName = commandName;
    return commandFn;
}

describe('createWorkflowRuntime', () => {
    let projectRoot: string;
    let events: CommandOutputEvent[];
    let info: string[];
    let logger: Logger;
    const activePids = new Set<number>();

    function runtimeInput(extra: Partial<CreateWorkflowRuntimeInput> = {}): CreateWorkflowRuntimeInput {
        return {
            context: { name: 'ctx', variables: {} },
            lumpVariables: {},
            contextRunState: {},
            projectRoot,
            workspacePath: projectRoot,
            onCommandOutput: (event) => { events.push(event); },
            logger,
            ...extra,
        };
    }

    function track(pids: number[]) {
        for (const pid of pids) activePids.add(pid);
    }

    async function releasePids(pids: number[]) {
        for (const pid of pids) {
            await waitForPidGone(pid);
            expect(probeAlive(pid)).toBe(false);
            activePids.delete(pid);
        }
    }

    beforeEach(async () => {
        projectRoot = await mkdtemp(join(tmpdir(), 'workflow-runtime-'));
        events = [];
        info = [];
        logger = {
            error: () => {},
            warn: () => {},
            info: (message) => { info.push(message); },
            verbose: () => {},
            child: () => logger,
        };
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
    });

    it('runs a string through sh and a descriptor directly', async () => {
        const runtime = createWorkflowRuntime(runtimeInput());

        const viaShell = await runtime.shell('echo a && echo b');
        expect(viaShell.succeeded).toBe(true);
        expect(viaShell.exitCode).toBe(0);
        expect(viaShell.timedOut).toBe(false);
        expect(viaShell.output).toMatch(/a\s+b/s);

        const viaDirect = await runtime.shell({ executable: 'echo', args: ['a && echo b'] });
        expect(viaDirect.succeeded).toBe(true);
        expect(viaDirect.output.trim()).toBe('a && echo b');

        const shellStart = events.find((event) => event.kind === 'start');
        expect(shellStart && shellStart.kind === 'start' && shellStart.executable).toBe('sh');
        expect(shellStart && shellStart.kind === 'start' && shellStart.callKind).toBe('shell');
        expect(shellStart && shellStart.kind === 'start' && shellStart.stepIndex).toEqual([0, 1]);
    });

    it('joins stdout and stderr in the result output', async () => {
        const runtime = createWorkflowRuntime(runtimeInput());
        const result = await runtime.shell({
            executable: process.execPath,
            args: ['-e', 'process.stdout.write("OUT"); process.stderr.write("ERR");'],
        });
        expect(result.succeeded).toBe(true);
        expect(result.output).toContain('OUT');
        expect(result.output).toContain('ERR');
    });

    it('returns a failed result for a non-zero exit', async () => {
        const runtime = createWorkflowRuntime(runtimeInput());
        const result = await runtime.shell('exit 2');
        expect(result.succeeded).toBe(false);
        expect(result.exitCode).toBe(2);
        expect(result.timedOut).toBe(false);
    });

    it('defaults cwd to the workspace and merges env over process.env', async () => {
        const runtime = createWorkflowRuntime(runtimeInput());
        const cwd = await runtime.shell('pwd');
        expect(cwd.output.trim()).toBe(projectRoot);

        const marked = await runtime.shell('printf %s "$WORKFLOW_MARK"', {
            env: { WORKFLOW_MARK: 'from-workflow' },
        });
        expect(marked.succeeded).toBe(true);
        expect(marked.output).toBe('from-workflow');
    });

    it('uses the command text as the shell label unless one is passed', async () => {
        const runtime = createWorkflowRuntime(runtimeInput());
        await runtime.shell('echo ok');
        const start = events.find((event) => event.kind === 'start');
        expect(start && start.kind === 'start' && start.label).toBe('echo ok');

        events.length = 0;
        await runtime.shell('echo ok', { label: 'custom' });
        const labeled = events.find((event) => event.kind === 'start');
        expect(labeled && labeled.kind === 'start' && labeled.label).toBe('custom');
    });

    it('returns timedOut for a call timeout and leaves the workflow signal open', async () => {
        const ready = join(projectRoot, 'call-timeout.json');
        const runtime = createWorkflowRuntime(runtimeInput({
            createTimeoutSignal: () => AbortSignal.timeout(60_000),
        }));
        const pending = runtime.shell(hangCommand(ready), { timeoutMillis: 2000 });
        const { pids } = await waitForReadyFile(ready);
        track(pids);

        const result = await pending;
        expect(result.timedOut).toBe(true);
        expect(result.succeeded).toBe(false);
        expect(result.exitCode).toBeNull();
        expect(runtime.signal.aborted).toBe(false);
        await releasePids(pids);

        const again = await runtime.shell('echo still-open');
        expect(again.succeeded).toBe(true);
        expect(again.output).toContain('still-open');
    });

    it('aborts in-flight calls when the workflow times out', async () => {
        const ready = join(projectRoot, 'workflow-timeout.json');
        const runtime = createWorkflowRuntime(runtimeInput({ timeoutMillis: 2000 }));
        const pending = runtime.shell(hangCommand(ready));
        const { pids } = await waitForReadyFile(ready);
        track(pids);

        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        expect(runtime.signal.aborted).toBe(true);
        await expect(runtime.shell('echo later')).rejects.toMatchObject({ name: 'AbortError' });
        await releasePids(pids);
    });

    it('aborts in-flight calls when the run signal aborts', async () => {
        const ready = join(projectRoot, 'abort.json');
        const controller = new AbortController();
        const runtime = createWorkflowRuntime(runtimeInput({
            signal: controller.signal,
            createTimeoutSignal: () => AbortSignal.timeout(60_000),
        }));
        expect(runtime.signal.aborted).toBe(false);

        const pending = runtime.shell(hangCommand(ready));
        const { pids } = await waitForReadyFile(ready);
        track(pids);
        controller.abort();

        expect(runtime.signal.aborted).toBe(true);
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        await expect(runtime.shell('echo later')).rejects.toMatchObject({ name: 'AbortError' });
        await releasePids(pids);
    });

    it('streams chunks while a single call is in flight', async () => {
        const ready = join(projectRoot, 'stream.json');
        const release = join(projectRoot, 'stream-go');
        const runtime = createWorkflowRuntime(runtimeInput());
        const pending = runtime.shell(holdCommand(ready, release, 'AAA'));
        const { pids } = await waitForReadyFile(ready);
        track(pids);

        await vi.waitFor(() => {
            expect(events.some((event) => event.kind === 'chunk' && event.chunk.includes('AAA-1'))).toBe(true);
        });
        expect(probeAlive(pids[0]!)).toBe(true);

        await writeFile(release, 'go');
        const result = await pending;
        expect(result.output).toContain('AAA-1');
        expect(result.output).toContain('AAA-2');
        await releasePids(pids);
    });

    it('buffers parallel chunks until each call ends, in end order', async () => {
        const readyA = join(projectRoot, 'ready-a.json');
        const readyB = join(projectRoot, 'ready-b.json');
        const releaseA = join(projectRoot, 'go-a');
        const releaseB = join(projectRoot, 'go-b');
        const runtime = createWorkflowRuntime(runtimeInput());

        const a = runtime.shell(holdCommand(readyA, releaseA, 'AAA'));
        const readyAPids = await waitForReadyFile(readyA);
        track(readyAPids.pids);
        await delay(200);
        expect(events.filter((event) => event.kind === 'chunk')).toEqual([]);
        expect(events.filter((event) => event.kind === 'start').map((event) => (
            event.kind === 'start' ? event.stepIndex : undefined
        ))).toEqual([[0, 1]]);

        const b = runtime.shell(holdCommand(readyB, releaseB, 'BBB'));
        const readyBPids = await waitForReadyFile(readyB);
        track(readyBPids.pids);
        await delay(200);
        expect(events.filter((event) => event.kind === 'chunk')).toEqual([]);
        expect(events.filter((event) => event.kind === 'start').map((event) => (
            event.kind === 'start' ? event.stepIndex : undefined
        ))).toEqual([[0, 1], [0, 2]]);
        expect(events.filter((event) => event.kind === 'start').every((event) => (
            event.kind === 'start' && event.callKind === 'shell'
        ))).toBe(true);

        await writeFile(releaseB, 'go');
        await b;
        const afterB = events.filter((event) => event.kind === 'chunk').map((event) => (
            event.kind === 'chunk' ? event.chunk : ''
        )).join('');
        expect(afterB).toContain('BBB-1');
        expect(afterB).toContain('BBB-2');
        expect(afterB).not.toContain('AAA');
        expect(probeAlive(readyAPids.pids[0]!)).toBe(true);

        await writeFile(releaseA, 'go');
        await a;
        const chunks = events.filter((event) => event.kind === 'chunk').map((event) => (
            event.kind === 'chunk' ? event.chunk : ''
        )).join('');
        const b1 = chunks.indexOf('BBB-1');
        const b2 = chunks.indexOf('BBB-2');
        const a1 = chunks.indexOf('AAA-1');
        const a2 = chunks.indexOf('AAA-2');
        expect(b1).toBeGreaterThanOrEqual(0);
        expect(b2).toBeGreaterThan(b1);
        expect(a1).toBeGreaterThan(b2);
        expect(a2).toBeGreaterThan(a1);
        await releasePids([...readyAPids.pids, ...readyBPids.pids]);
    });

    it('opens sessions from a function argument or from options.command', async () => {
        const seen: Array<{ sessionId?: string }> = [];
        const commandFn = makeCommand('echo-agent', seen);
        const runtime = createWorkflowRuntime(runtimeInput());
        const byArg = await runtime.agent.session(commandFn);
        const byOption = await runtime.agent.session({ command: commandFn });

        expect(byArg.command).toBe('echo-agent');
        expect(byArg.sessionId).toMatch(UUID);
        expect(byOption.command).toBe('echo-agent');
        expect(byOption.sessionId).toMatch(UUID);
        expect(byOption.sessionId).not.toBe(byArg.sessionId);

        const prompted = await byArg.prompt('hi');
        expect(prompted.succeeded).toBe(true);
        expect(prompted.output).toContain('hi');
        expect(seen[0]?.sessionId).toBe(byArg.sessionId);
    });

    it('uses the runtime command as the default session', async () => {
        const seen: string[] = [];
        const commandFn: CommandFn = ({ sessionId }) => {
            seen.push(sessionId ?? '');
            return { executable: 'echo', args: ['ok'] };
        };
        commandFn.commandName = 'echo-agent';
        const runtime = createWorkflowRuntime(runtimeInput({ command: commandFn }));

        const session = await runtime.agent.session();
        expect(session.command).toBe('echo-agent');
        expect(session.sessionId).toMatch(UUID);

        const other = await runtime.agent.session();
        expect(other.sessionId).not.toBe(session.sessionId);

        await runtime.agent.prompt('one');
        await runtime.agent.prompt('two');
        expect(seen).toHaveLength(2);
        expect(seen[0]).toMatch(UUID);
        expect(seen[1]).toBe(seen[0]);
    });

    it('rejects a string command tag', async () => {
        const runtime = createWorkflowRuntime(runtimeInput());
        await expect(runtime.agent.session('cursor')).rejects.toThrow(
            'Command tags like "cursor" need a host that resolves them (the Lumpcode CLI); pass a CommandFn.',
        );
    });

    it('rejects a command passed both ways', async () => {
        const commandFn = makeCommand('echo-agent');
        const runtime = createWorkflowRuntime(runtimeInput());
        await expect(runtime.agent.session(commandFn, { command: commandFn })).rejects.toThrow(
            'Pass the command once: as the first argument or as options.command.',
        );
    });

    it('keeps a session on the command that created it', async () => {
        const alpha = makeCommand('alpha');
        const beta = makeCommand('beta');
        const runtime = createWorkflowRuntime(runtimeInput());
        const session = await runtime.agent.session(alpha);
        const again = await runtime.agent.session(alpha, { sessionId: session.sessionId });
        expect(again.sessionId).toBe(session.sessionId);

        await expect(runtime.agent.session(beta, { sessionId: session.sessionId })).rejects.toThrow(
            `Session ${session.sessionId} belongs to command alpha, not beta.`,
        );
    });

    it('passes an unknown session id through', async () => {
        const seen: Array<{ sessionId?: string }> = [];
        const commandFn = makeCommand('echo-agent', seen);
        const runtime = createWorkflowRuntime(runtimeInput());
        const session = await runtime.agent.session(commandFn, { sessionId: 'from-earlier-run' });
        expect(session.sessionId).toBe('from-earlier-run');
        await session.prompt('resume');
        expect(seen[0]?.sessionId).toBe('from-earlier-run');
    });

    it('rejects a second prompt on a session that is already running', async () => {
        const ready = join(projectRoot, 'busy.json');
        const release = join(projectRoot, 'busy-go');
        const commandFn: CommandFn = () => holdCommand(ready, release, 'BUSY');
        commandFn.commandName = 'busy-agent';
        const runtime = createWorkflowRuntime(runtimeInput());
        const session = await runtime.agent.session(commandFn);
        const first = session.prompt('one');
        const { pids } = await waitForReadyFile(ready);
        track(pids);

        await expect(session.prompt('two')).rejects.toThrow(
            `Session ${session.sessionId} is already running a prompt.`,
        );

        await writeFile(release, 'go');
        await first;
        await releasePids(pids);
    });

    it('layers prompt options lump, then session, then call', async () => {
        const seen: Array<{ stepVariables?: StepVariables }> = [];
        const commandFn = makeCommand('layered', seen);
        const runtime = createWorkflowRuntime(runtimeInput({
            command: commandFn,
            lumpVariables: {
                model: 'lump',
                extraArgs: ['--lump'],
                agentPermissions: { tier: 'lump' },
            },
        }));
        const session = await runtime.agent.session({
            model: 'session',
            extraArgs: ['--session'],
            permissions: { tier: 'session' },
        });
        await session.prompt('hi', { model: 'call' });
        expect(seen[0]?.stepVariables).toEqual({
            model: 'call',
            extraArgs: ['--session'],
            agentPermissions: { tier: 'session' },
        });
    });

    it('labels a prompt with the first line, capped at 60 characters', async () => {
        const commandFn = makeCommand('echo-agent');
        const runtime = createWorkflowRuntime(runtimeInput({ command: commandFn }));
        const text = `${'x'.repeat(80)}\nsecond line`;
        await runtime.agent.prompt(text);
        const start = events.find((event) => event.kind === 'start');
        expect(start && start.kind === 'start' && start.label).toBe('x'.repeat(60));
        expect(start && start.kind === 'start' && start.callKind).toBe('prompt');
    });

    it('writes log to the logger and emits a log event', async () => {
        const runtime = createWorkflowRuntime(runtimeInput());
        runtime.log('working');
        expect(info).toContain('working');
        expect(events).toContainEqual({ kind: 'log', contextName: 'ctx', message: 'working' });
    });

    it('uses a 2 hour deadline when timeoutMillis is omitted', () => {
        const seen: number[] = [];
        const runtime = createWorkflowRuntime(runtimeInput({
            createTimeoutSignal: (millis) => {
                seen.push(millis);
                return AbortSignal.timeout(60_000);
            },
        }));
        expect(seen).toEqual([TWO_HOURS]);
        expect(runtime.signal.aborted).toBe(false);
    });

    it('passes an explicit timeoutMillis to the deadline signal', () => {
        const seen: number[] = [];
        createWorkflowRuntime(runtimeInput({
            timeoutMillis: 1500,
            createTimeoutSignal: (millis) => {
                seen.push(millis);
                return AbortSignal.timeout(60_000);
            },
        }));
        expect(seen).toEqual([1500]);
    });

    it('gives createAgent a runAgentCall that locks one prompt per session', async () => {
        const readyA = join(projectRoot, 'host-a.json');
        const readyB = join(projectRoot, 'host-b.json');
        const releaseA = join(projectRoot, 'host-a-go');
        const releaseB = join(projectRoot, 'host-b-go');
        let runAgentCall: CreateAgentInput['runAgentCall'] | undefined;
        createWorkflowRuntime(runtimeInput({
            createAgent: (input) => {
                runAgentCall = input.runAgentCall;
                expect(input.context.name).toBe('ctx');
                expect(input.workspacePath).toBe(projectRoot);
                return {
                    session: async () => { throw new Error('unused'); },
                    prompt: async () => { throw new Error('unused'); },
                };
            },
        }));
        expect(runAgentCall).toEqual(expect.any(Function));

        const commandFn: CommandFn = ({ sessionId }) => holdCommand(
            sessionId === 'a' ? readyA : readyB,
            sessionId === 'a' ? releaseA : releaseB,
            sessionId === 'a' ? 'AAA' : 'BBB',
        );
        commandFn.commandName = 'host';
        const call = runAgentCall!;
        const first = call({
            commandFn,
            commandName: 'host',
            prompt: 'one',
            sessionId: 'a',
            stepVariables: {},
        });
        const second = call({
            commandFn,
            commandName: 'host',
            prompt: 'two',
            sessionId: 'b',
            stepVariables: {},
        });
        const pidsA = await waitForReadyFile(readyA);
        const pidsB = await waitForReadyFile(readyB);
        track([...pidsA.pids, ...pidsB.pids]);

        await expect(call({
            commandFn,
            commandName: 'host',
            prompt: 'three',
            sessionId: 'a',
            stepVariables: {},
        })).rejects.toThrow('Session a is already running a prompt.');

        await writeFile(releaseA, 'go');
        await writeFile(releaseB, 'go');
        await first;
        await second;
        await releasePids([...pidsA.pids, ...pidsB.pids]);
    });
});
