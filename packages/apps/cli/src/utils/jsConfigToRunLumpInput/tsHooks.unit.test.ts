import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { CommandFn, GetContextListFn, Step } from '@lumpcode/core';

import type { LumpJsConfig, LumpJsConfigStep } from '../../types';
import { getJsConfigFromLumpName } from '../getJsConfigFromLumpName';
import { jsConfigToRunLumpInput } from './main';

const FIXTURES_DIR = path.resolve(__dirname, '__fixtures__');
const LOCAL_CONFIG_PATH = path.join(FIXTURES_DIR, 'local-config');
const GLOBAL_CONFIG_PATH = path.join(FIXTURES_DIR, 'global-config');
const DEFAULT_TEST_WORKSPACE = path.join('/tmp', 'project');
const DEFAULT_TEST_PROJECT_BASE_BRANCH = 'main';

const stubCommandFn: CommandFn = () => ({ executable: 'test-cli', args: ['-p'] });
const stubGetContextListFn: GetContextListFn = () => [{ name: 'ctx1', variables: { FILE: 'a.ts' } }];

const commandFnCallArgs = {
    context: { name: 'ctx', variables: {} },
    prompt: 'test',
    stepIndex: 0,
    contextRunState: {},
    lumpVariables: {},
    projectRoot: '/tmp',
    workspacePath: '/tmp',
} as const;

function makeConfig(overrides: Partial<LumpJsConfig> = {}): LumpJsConfig {
    return {
        getContextListFn: stubGetContextListFn,
        prompt: { promptFn: () => 'do something', commandFn: stubCommandFn },
        ...overrides,
    } as LumpJsConfig;
}

function resolveWithFixtures(
    configOverrides: Partial<LumpJsConfig>,
    opts: { lumpName?: string } = {},
) {
    return jsConfigToRunLumpInput({
        config: makeConfig(configOverrides),
        lumpName: opts.lumpName ?? 'my-lump',
        localConfigFolderPath: LOCAL_CONFIG_PATH,
        globalConfigFolderPath: GLOBAL_CONFIG_PATH,
        projectBaseBranch: DEFAULT_TEST_PROJECT_BASE_BRANCH,
        executionWorkspacePath: DEFAULT_TEST_WORKSPACE,
        workspaceStrategy: 'checkout',
    });
}

function assertSuccess<T>(result: { success: true; data: T } | { success: false; data: string }): T {
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    return result.data;
}

function promptFnInput(variables: Record<string, string> = {}) {
    return { context: { name: 'ctx', variables }, stepIndex: 0, contextRunState: {}, lumpVariables: {} };
}

describe('jsConfigToRunLumpInput TypeScript file-backed hooks', () => {
    const hooksDir = path.join(LOCAL_CONFIG_PATH, 'hooks');
    const lumpDir = path.join(LOCAL_CONFIG_PATH, 'lumps', 'my-lump');

    it('J1 should resolve setupFn and teardownFn from .ts FilePath', async () => {
        const data = assertSuccess(await resolveWithFixtures({
            setupFn: path.join(hooksDir, 'setup.ts'),
            teardownFn: path.join(hooksDir, 'teardown.ts'),
            command: stubCommandFn,
            prompt: 'Hello',
        }));

        const setupResult = await data.setupFn!({
            contextList: [{ name: 'ctx', variables: {} }],
            lumpVariables: {},
            currentContextIndex: 0,
        });
        expect(setupResult?.contextRunState).toMatchObject({ fromSetupHook: true });
    });

    it('J2 should resolve postCommandExecFn from .ts FilePath on prompt item', async () => {
        const data = assertSuccess(await resolveWithFixtures({
            command: stubCommandFn,
            prompt: {
                promptTemplate: 'Hi',
                commandFn: stubCommandFn,
                postCommandExecFn: path.join(hooksDir, 'postCommandExec.ts'),
            } as LumpJsConfigStep,
        }));
        const item = data.steps[0] as Step;
        expect(item.postCommandExecFn).toBeTypeOf('function');
    });

    it('J3 should resolve getContextListFn from .ts relative FilePath', async () => {
        const data = assertSuccess(await resolveWithFixtures({
            getContextListFn: './getContextList.ts',
            contextMatchFn: undefined,
            contextListJson: undefined,
        }));
        const contexts = await data.getContextListFn({
            codeBasePaths: [],
            lumpVariables: {},
        });
        expect(contexts).toEqual([{ name: 'from-file', variables: { FILE: 'via-relative-path.ts' } }]);
    });

    it('J4 should resolve contextMatchFn, promptFn, and contextOptionsFn from .ts paths', async () => {
        const matchData = assertSuccess(await resolveWithFixtures({
            getContextListFn: undefined,
            contextListJson: undefined,
            contextMatchFn: path.join(lumpDir, 'contextMatch.ts'),
            command: stubCommandFn,
            prompt: 'Hi',
        }));
        const matched = await matchData.getContextListFn({
            codeBasePaths: [{ isDir: false, path: 'src/app.ts' }],
            lumpVariables: {},
        });
        expect(matched).toEqual([{ name: 'ts-match', variables: { FILE: 'src/app.ts' } }]);

        const promptData = assertSuccess(await resolveWithFixtures({
            prompt: {
                promptFn: path.join(hooksDir, 'prompt.ts'),
                commandFn: stubCommandFn,
            } as LumpJsConfigStep,
        }));
        expect(await (promptData.steps[0] as Step).promptFn?.(promptFnInput())).toBe('Prompt from ts hook');

        const optionsData = assertSuccess(await resolveWithFixtures({
            getContextListFn: undefined,
            contextMatchFn: undefined,
            contextListJson: { NAME: '{NAME}.md' },
            contextOptionsFn: path.join(lumpDir, 'contextOptions.ts'),
            command: stubCommandFn,
            prompt: 'Hi',
        }));
        const contexts = await optionsData.getContextListFn({
            codeBasePaths: [{ isDir: false, path: 'README.md' }],
            lumpVariables: {},
        });
        expect(contexts[0]?.options).toEqual({ dependsOnContexts: ['other/ctx'] });
    });

    it('J5 should load command module backed by local .ts command file', async () => {
        const data = assertSuccess(await resolveWithFixtures({
            command: 'test-agent',
            prompt: undefined,
            steps: ['Step 1'],
        }));
        const item = data.steps[0] as Step;
        expect((await item.commandFn?.(commandFnCallArgs))?.executable).toBe('local-agent');
    });

    it('J6 should resolve .ts hook paths from config.json', async () => {
        const cfg = assertSuccess(await getJsConfigFromLumpName({
            lumpName: 'json-ts-hooks',
            localConfigFolderPath: LOCAL_CONFIG_PATH,
        }));
        const data = assertSuccess(await jsConfigToRunLumpInput({
            config: cfg,
            lumpName: 'json-ts-hooks',
            localConfigFolderPath: LOCAL_CONFIG_PATH,
            globalConfigFolderPath: GLOBAL_CONFIG_PATH,
            projectBaseBranch: DEFAULT_TEST_PROJECT_BASE_BRANCH,
            executionWorkspacePath: DEFAULT_TEST_WORKSPACE,
            workspaceStrategy: 'checkout',
        }));

        const setupResult = await data.setupFn!({
            contextList: [{ name: 'ctx', variables: {} }],
            lumpVariables: {},
            currentContextIndex: 0,
        });
        expect(setupResult?.contextRunState).toMatchObject({ fromSetupHook: true });
    });
});
