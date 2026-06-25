import type { E2eProject } from './createE2eProject';
import { resolveE2eCliInvocation, type E2eCliInvocation } from './resolveE2eCliInvocation';
import { runCli, tail, type RunCliResult } from './runCli';

const e2eInvocation = resolveE2eCliInvocation();

/** Resolved e2e CLI spawn target (`LUMPCODE_E2E_RUNNER` / `LUMPCODE_E2E_BINARY`). */
export function e2eCliInvocation(): E2eCliInvocation {
    return e2eInvocation;
}

/** Primary executable for spawning the CLI (Node binary when `runner` is `node`). */
export function e2eBinary(): string {
    return e2eInvocation.executable;
}

/** Runs the e2e CLI against a project with an isolated `HOME` and parsed `--json` output. */
export function runE2eCli(input: { project: E2eProject; args: string[]; timeoutMs?: number }) {
    return runCli({
        executable: e2eInvocation.executable,
        projectRoot: input.project.projectRoot,
        homeDir: input.project.homeDir,
        args: [...e2eInvocation.argsPrefix, ...input.args],
        timeoutMs: input.timeoutMs,
        pathPrefix: input.project.pathPrefix,
    });
}

/** Fails when the CLI exited non-zero or emitted a fatal startup message in `--json` output. */
export function expectCliOk(result: RunCliResult, step: string): void {
    const detail = tail(result.stderr || result.stdout);
    if (result.code !== 0) {
        throw new Error(`${step}: exit ${result.code ?? 'null'}\n${detail}`);
    }
    const msg = result.json.messages.join(' ');
    if (/cannot find module|not a lumpcode project/i.test(msg)) {
        throw new Error(`${step}: ${msg}\n${detail}`);
    }
}

/** Asserts a `--json` invocation failed with a parseable failure envelope. */
export function expectCliFailureEnvelope(result: RunCliResult): void {
    if (result.code === 0) {
        throw new Error(`expected non-zero exit, got 0\n${tail(result.stderr || result.stdout)}`);
    }
    const line = result.stdout.trim().split('\n').find((l) => l.startsWith('{'));
    if (!line) {
        throw new Error(`expected JSON envelope line in stdout\n${tail(result.stderr || result.stdout)}`);
    }
    const envelope = JSON.parse(line) as { success?: boolean };
    if (envelope.success !== false) {
        throw new Error(`expected success: false envelope, got ${JSON.stringify(envelope)}`);
    }
}
