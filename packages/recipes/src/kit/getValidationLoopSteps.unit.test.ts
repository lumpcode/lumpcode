import { execSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { LumpJsConfigSteps } from '@lumpcode/cli-utils';
import {
    executeStepsForContextList,
    success,
    type CommandOutputEvent,
    type Logger,
    type LumpVariables,
} from '@lumpcode/core';

import type { ValidationCommandFn } from './getValidationLoopSteps';
import { retryUntilGreen } from './retryUntilGreen';
import { shellCommand } from './shellCommand';

const silentLogger: Logger = {
    error() {},
    warn() {},
    info() {},
    verbose() {},
    child() {
        return silentLogger;
    },
};

function assertPathIsUnderOsTmpdir(dir: string): void {
    const tmp = path.resolve(tmpdir());
    const resolved = path.resolve(dir);
    const rel = path.relative(tmp, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`refusing git init outside os.tmpdir(): ${dir}`);
    }
}

function initTestGitRepo(projectRoot: string): void {
    assertPathIsUnderOsTmpdir(projectRoot);
    execSync(
        'git init && git config user.email "test@test.com" && git config user.name "Test" && git commit --allow-empty -m "init"',
        { cwd: projectRoot, stdio: 'pipe' },
    );
}

const redCheck = () => shellCommand('echo red; exit 1');
const greenCheck = () => ({ executable: 'true', args: [] });

describe('retryUntilGreen through executeStepsForContextList', () => {
    const roots: string[] = [];

    afterEach(async () => {
        await Promise.all(roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
    });

    async function run({
        maxIterations,
        pushOnValidationFailure,
        validationFailedVariableName,
        validationCommandFn,
        nest = false,
    }: {
        maxIterations?: number;
        pushOnValidationFailure?: boolean;
        validationFailedVariableName?: string;
        validationCommandFn: ValidationCommandFn;
        nest?: boolean;
    }) {
        const projectRoot = await mkdtemp(path.join(tmpdir(), 'retry-until-green-'));
        roots.push(projectRoot);
        initTestGitRepo(projectRoot);

        const lumpVariables: LumpVariables = {};
        const gitEvents: string[] = [];
        const executables: string[] = [];
        const chunks: string[] = [];
        let checks = 0;
        let afterRan = false;

        const loop = retryUntilGreen({
            steps: [{ commandFn: () => ({ executable: 'true', args: [] }) }],
            validationCommandFn(input) {
                checks += 1;
                return validationCommandFn(input);
            },
            ...(maxIterations === undefined ? {} : { maxIterations }),
            ...(pushOnValidationFailure === undefined ? {} : { pushOnValidationFailure }),
            ...(validationFailedVariableName === undefined ? {} : { validationFailedVariableName }),
        });

        const afterStep = {
            commandFn() {
                afterRan = true;
                return { executable: 'true', args: [] };
            },
        };

        const steps: LumpJsConfigSteps = nest
            ? [() => [...loop, afterStep]]
            : [...loop, afterStep];

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: async () => 'lump/test/ctx',
            lumpVariables,
            contextList: [{ name: 'ctx', variables: {} }],
            gitAddCommitFn() {
                gitEvents.push('commit');
                return success(undefined);
            },
            gitPushFn() {
                gitEvents.push('push');
                return success(undefined);
            },
            gitCommitMessageFn: () => 'LUMP:ctx',
            projectRoot,
            steps,
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
            logger: silentLogger,
            onCommandOutput(event: CommandOutputEvent) {
                if (event.kind === 'start') {
                    executables.push(event.executable);
                }
                if (event.kind === 'chunk') {
                    chunks.push(event.chunk);
                }
            },
        });

        return {
            result,
            lumpVariables,
            gitEvents,
            checks,
            afterRan,
            executables,
            output: chunks.join(''),
        };
    }

    function expectNoLoopLimitSubstitute(executables: string[], output: string) {
        expect(executables).not.toContain('echo');
        expect(output).not.toContain('Loop limit reached');
    }

    it.each([
        { nest: false, maxIterations: undefined, checks: 6, label: 'top-level default' },
        { nest: false, maxIterations: 2, checks: 3, label: 'top-level maxIterations 2' },
        { nest: true, maxIterations: undefined, checks: 6, label: 'nested default' },
        { nest: true, maxIterations: 2, checks: 3, label: 'nested maxIterations 2' },
    ])(
        'always-red $label still commits and pushes with the flag set',
        async ({ nest, maxIterations, checks: expectedChecks }) => {
            const { result, lumpVariables, gitEvents, checks, afterRan, executables, output } = await run({
                nest,
                maxIterations,
                validationCommandFn: redCheck,
            });

            expect(result.success).toBe(true);
            expect(gitEvents).toEqual(['commit', 'push']);
            expect(lumpVariables.__VALIDATION_FAILED__).toBe(true);
            expect(checks).toBe(expectedChecks);
            expect(afterRan).toBe(true);
            expectNoLoopLimitSubstitute(executables, output);
        },
    );

    it('withholds the push when pushOnValidationFailure is false', async () => {
        const { result, lumpVariables, gitEvents, checks, afterRan, executables, output } = await run({
            maxIterations: 2,
            pushOnValidationFailure: false,
            validationCommandFn: redCheck,
        });

        expect(result).toMatchObject({
            success: false,
            data: { reason: 'stepWalkFailed' },
        });
        expect(gitEvents).toEqual([]);
        expect(lumpVariables.__VALIDATION_FAILED__).toBe(true);
        expect(checks).toBe(3);
        expect(afterRan).toBe(false);
        expectNoLoopLimitSubstitute(executables, output);
    });

    it('writes the flag to validationFailedVariableName when set', async () => {
        const red = await run({
            maxIterations: 1,
            validationFailedVariableName: 'LINT_FAILED',
            validationCommandFn: redCheck,
        });
        expect(red.lumpVariables.LINT_FAILED).toBe(true);
        expect(red.lumpVariables).not.toHaveProperty('__VALIDATION_FAILED__');

        const green = await run({
            validationFailedVariableName: 'LINT_FAILED',
            validationCommandFn: greenCheck,
        });
        expect(green.lumpVariables.LINT_FAILED).toBe(false);
        expect(green.lumpVariables).not.toHaveProperty('__VALIDATION_FAILED__');
    });

    it('sets the flag false and stops when the check passes on attempt 0', async () => {
        const { result, lumpVariables, gitEvents, checks, afterRan } = await run({
            validationCommandFn: greenCheck,
        });

        expect(result.success).toBe(true);
        expect(gitEvents).toEqual(['commit', 'push']);
        expect(lumpVariables.__VALIDATION_FAILED__).toBe(false);
        expect(checks).toBe(1);
        expect(afterRan).toBe(true);
    });

    it('sets the flag false and stops when the check passes on a middle attempt', async () => {
        const { result, lumpVariables, gitEvents, checks, afterRan, executables, output } = await run({
            maxIterations: 4,
            validationCommandFn: ({ currentIteration }) => (
                currentIteration === 2 ? greenCheck() : redCheck()
            ),
        });

        expect(result.success).toBe(true);
        expect(gitEvents).toEqual(['commit', 'push']);
        expect(lumpVariables.__VALIDATION_FAILED__).toBe(false);
        expect(checks).toBe(3);
        expect(afterRan).toBe(true);
        expectNoLoopLimitSubstitute(executables, output);
    });

    it('sets the flag false when the check passes only on the last attempt', async () => {
        const { result, lumpVariables, gitEvents, checks, afterRan, executables, output } = await run({
            maxIterations: 2,
            validationCommandFn: ({ currentIteration }) => (
                currentIteration === 2 ? greenCheck() : redCheck()
            ),
        });

        expect(result.success).toBe(true);
        expect(gitEvents).toEqual(['commit', 'push']);
        expect(lumpVariables.__VALIDATION_FAILED__).toBe(false);
        expect(checks).toBe(3);
        expect(afterRan).toBe(true);
        expectNoLoopLimitSubstitute(executables, output);
    });
});
