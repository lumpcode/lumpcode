import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { SetupWorkspaceFn, TeardownWorkspaceFn } from '@lumpcode/core';

import type { PostSetupWorkspaceFn } from '../../types/PostSetupWorkspaceFn';
import type { PostSetupWorkspaceFnInput } from '../../types/PostSetupWorkspaceFnInput';
import { atDirectory } from '../atDirectory';
import { composeLumpWorkspaceFns } from './main';

const contextList = [{ name: 'ctx', variables: {} }];
const setupInput = {
    baseBranch: 'main',
    branchName: 'lump/foo/ctx',
    contextList,
};
const teardownInput = {
    ...setupInput,
    workspacePath: '/wk',
};

const extraHookFields = {
    executionWorkspacePath: '/wk',
    workspaceStrategy: 'checkout' as const,
    projectRoot: '/src',
    lumpVariables: { install: true },
};

function makeBuiltInSetup(result: Awaited<ReturnType<SetupWorkspaceFn>>): SetupWorkspaceFn {
    return async () => result;
}

function makeBuiltInTeardown(command: string, onCall?: () => void): TeardownWorkspaceFn {
    return async () => {
        onCall?.();
        return command;
    };
}

describe('composeLumpWorkspaceFns', () => {
    describe('setup', () => {
        it('invokes postSetup after built-in setup with the prepared workspace bag', async () => {
            const hookInputs: PostSetupWorkspaceFnInput[] = [];
            const postSetupWorkspaceFn: PostSetupWorkspaceFn = async (input) => {
                hookInputs.push(input);
                return { command: 'npm i' };
            };

            const { setupWorkspaceFn } = composeLumpWorkspaceFns({
                setupWorkspaceFn: makeBuiltInSetup({
                    command: '',
                    workspacePath: '/wk',
                }),
                teardownWorkspaceFn: makeBuiltInTeardown(''),
                postSetupWorkspaceFn,
                ...extraHookFields,
            });

            await setupWorkspaceFn(setupInput);

            expect(hookInputs).toEqual([
                {
                    ...setupInput,
                    workspacePath: '/wk',
                    ...extraHookFields,
                },
            ]);
        });

        it('keeps the built-in workspacePath even if the hook tries to ignore it', async () => {
            const { setupWorkspaceFn } = composeLumpWorkspaceFns({
                setupWorkspaceFn: makeBuiltInSetup({
                    command: '',
                    workspacePath: '/wk/branch',
                }),
                teardownWorkspaceFn: makeBuiltInTeardown(''),
                postSetupWorkspaceFn: async () => ({ command: 'npm i' }),
                ...extraHookFields,
                executionWorkspacePath: '/wk',
                workspaceStrategy: 'worktree',
            });

            const out = await setupWorkspaceFn(setupInput);
            expect(out.workspacePath).toBe('/wk/branch');
            expect(out.command).toBe(atDirectory('/wk/branch', 'npm i'));
        });

        it('returns the wrapped user command when built-in command is empty', async () => {
            const { setupWorkspaceFn } = composeLumpWorkspaceFns({
                setupWorkspaceFn: makeBuiltInSetup({
                    command: '',
                    workspacePath: '/wk',
                }),
                teardownWorkspaceFn: makeBuiltInTeardown(''),
                postSetupWorkspaceFn: async () => ({ command: 'npm i' }),
                ...extraHookFields,
            });

            const out = await setupWorkspaceFn(setupInput);
            expect(out.command).toBe(atDirectory('/wk', 'npm i'));
        });

        it('chains wrapped user command after a non-empty built-in command', async () => {
            const builtInCommand = "cd '/wk' && git switch -c 'lump/foo/ctx'";
            const { setupWorkspaceFn } = composeLumpWorkspaceFns({
                setupWorkspaceFn: makeBuiltInSetup({
                    command: builtInCommand,
                    workspacePath: '/wk',
                }),
                teardownWorkspaceFn: makeBuiltInTeardown(''),
                postSetupWorkspaceFn: async () => ({ command: 'npm i' }),
                ...extraHookFields,
            });

            const out = await setupWorkspaceFn(setupInput);
            expect(out.command).toBe(`${builtInCommand} && ${atDirectory('/wk', 'npm i')}`);
        });

        it.each([
            ['void', async () => undefined],
            ['empty object', async () => ({})],
            ['whitespace command', async () => ({ command: '   ' })],
        ] as const)('omits extra command when the hook returns %s', async (_label, postSetupWorkspaceFn) => {
            const builtInCommand = "cd '/wk' && git switch -c 'lump/foo/ctx'";
            const { setupWorkspaceFn } = composeLumpWorkspaceFns({
                setupWorkspaceFn: makeBuiltInSetup({
                    command: builtInCommand,
                    workspacePath: '/wk',
                }),
                teardownWorkspaceFn: makeBuiltInTeardown(''),
                postSetupWorkspaceFn,
                ...extraHookFields,
            });

            const out = await setupWorkspaceFn(setupInput);
            expect(out.command).toBe(builtInCommand);
        });

        it('forwards built-in afterExec unchanged', async () => {
            const afterExec = async () => undefined;
            const { setupWorkspaceFn } = composeLumpWorkspaceFns({
                setupWorkspaceFn: makeBuiltInSetup({
                    command: '',
                    workspacePath: '/wk',
                    afterExec,
                }),
                teardownWorkspaceFn: makeBuiltInTeardown(''),
                postSetupWorkspaceFn: async () => ({ command: 'npm i' }),
                ...extraHookFields,
            });

            const out = await setupWorkspaceFn(setupInput);
            expect(out.afterExec).toBe(afterExec);
        });

        it('returns built-in setup unchanged when no post hook is set', async () => {
            const builtIn = makeBuiltInSetup({
                command: "cd '/wk' && git switch -c 'lump/foo/ctx'",
                workspacePath: '/wk',
            });
            const { setupWorkspaceFn } = composeLumpWorkspaceFns({
                setupWorkspaceFn: builtIn,
                teardownWorkspaceFn: makeBuiltInTeardown(''),
                ...extraHookFields,
            });

            const out = await setupWorkspaceFn(setupInput);
            expect(out).toEqual(await builtIn(setupInput));
        });
    });

    describe('teardown', () => {
        it('invokes postTeardown before built-in teardown with the same bag', async () => {
            const order: string[] = [];
            const hookInputs: PostSetupWorkspaceFnInput[] = [];

            const { teardownWorkspaceFn } = composeLumpWorkspaceFns({
                setupWorkspaceFn: makeBuiltInSetup({ command: '', workspacePath: '/wk' }),
                teardownWorkspaceFn: async () => {
                    order.push('builtIn');
                    return "cd '/wk' && git switch 'main'";
                },
                postTeardownWorkspaceFn: async (input) => {
                    order.push('post');
                    hookInputs.push(input);
                },
                ...extraHookFields,
            });

            await teardownWorkspaceFn(teardownInput);

            expect(order).toEqual(['post', 'builtIn']);
            expect(hookInputs).toEqual([
                {
                    ...setupInput,
                    workspacePath: '/wk',
                    ...extraHookFields,
                },
            ]);
        });

        it('execs the user teardown command at workspacePath then returns the built-in command', async () => {
            const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'compose-post-td-'));
            try {
                const userCommand =
                    `node -e "require('fs').writeFileSync('marker.txt', 'ok')"`;
                let builtInCalled = false;
                const builtInCommand = "cd '/wk' && git switch 'main'";

                const { teardownWorkspaceFn } = composeLumpWorkspaceFns({
                    setupWorkspaceFn: makeBuiltInSetup({ command: '', workspacePath }),
                    teardownWorkspaceFn: makeBuiltInTeardown(builtInCommand, () => {
                        builtInCalled = true;
                    }),
                    postTeardownWorkspaceFn: async () => ({ command: userCommand }),
                    ...extraHookFields,
                });

                const cmd = await teardownWorkspaceFn({
                    ...teardownInput,
                    workspacePath,
                });

                expect(builtInCalled).toBe(true);
                expect(cmd).toBe(builtInCommand);
                await expect(fs.readFile(path.join(workspacePath, 'marker.txt'), 'utf-8')).resolves.toBe('ok');
            } finally {
                await fs.rm(workspacePath, { recursive: true, force: true });
            }
        });

        it('still runs built-in teardown when the user command fails, then throws', async () => {
            const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'compose-post-td-fail-'));
            try {
                let builtInCalled = false;

                const { teardownWorkspaceFn } = composeLumpWorkspaceFns({
                    setupWorkspaceFn: makeBuiltInSetup({ command: '', workspacePath }),
                    teardownWorkspaceFn: makeBuiltInTeardown('', () => {
                        builtInCalled = true;
                    }),
                    postTeardownWorkspaceFn: async () => ({
                        command: 'node -e "process.exit(1)"',
                    }),
                    ...extraHookFields,
                });

                await expect(
                    teardownWorkspaceFn({ ...teardownInput, workspacePath }),
                ).rejects.toThrow();
                expect(builtInCalled).toBe(true);
            } finally {
                await fs.rm(workspacePath, { recursive: true, force: true });
            }
        });

        it('does not exec a whitespace user command and still returns built-in teardown', async () => {
            let builtInCalled = false;
            const builtInCommand = "cd '/wk' && git switch 'main'";

            const { teardownWorkspaceFn } = composeLumpWorkspaceFns({
                setupWorkspaceFn: makeBuiltInSetup({ command: '', workspacePath: '/wk' }),
                teardownWorkspaceFn: makeBuiltInTeardown(builtInCommand, () => {
                    builtInCalled = true;
                }),
                postTeardownWorkspaceFn: async () => ({ command: '   ' }),
                ...extraHookFields,
            });

            const cmd = await teardownWorkspaceFn(teardownInput);
            expect(builtInCalled).toBe(true);
            expect(cmd).toBe(builtInCommand);
        });
    });
});
