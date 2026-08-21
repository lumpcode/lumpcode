import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { expect } from 'vitest';

import type { CommandFn, GetContextListFn, PromptFn } from '@lumpcode/core';

import type { LumpJsConfig } from '../../../types';
import { jsConfigToRunLumpInput } from '../main';

export const FIXTURES_DIR = path.resolve(__dirname, '..', '__fixtures__');
export const LOCAL_CONFIG_PATH = path.join(FIXTURES_DIR, 'local-config');
export const GLOBAL_CONFIG_PATH = path.join(FIXTURES_DIR, 'global-config');

export const DEFAULT_TEST_LOCAL_CONFIG = path.join('/tmp', 'project', '.lumpcode');
export const DEFAULT_TEST_GLOBAL_CONFIG = path.join('/tmp', 'project', '.lumpcode-global-fixture');
export const DEFAULT_TEST_WORKSPACE = path.join('/tmp', 'project');
export const DEFAULT_TEST_PROJECT_BASE_BRANCH = 'main';

export const stubCommandFn: CommandFn = () => ({ executable: 'test-cli', args: ['-p'] });
export const stubGetContextListFn: GetContextListFn = () => [{ name: 'ctx1', variables: { FILE: 'a.ts' } }];
export const stubPromptFn: PromptFn = () => 'do something';

export function initTestGitRepo(projectRoot: string) {
    execSync(
        'git init && git config user.email "test@test.com" && git config user.name "Test" && git commit --allow-empty -m "init"',
        { cwd: projectRoot, stdio: 'pipe' },
    );
}

export function makeConfig(overrides: Partial<LumpJsConfig> = {}): LumpJsConfig {
    return {
        getContextListFn: stubGetContextListFn,
        prompt: { promptFn: stubPromptFn, commandFn: stubCommandFn },
        ...overrides,
    } as LumpJsConfig;
}

export function resolveJsConf(
    configOverrides: Partial<LumpJsConfig>,
    opts: {
        lumpName?: string;
        localConfigFolderPath?: string;
        globalConfigFolderPath?: string;
        projectBaseBranch?: string;
        executionWorkspacePath?: string;
        workspaceStrategy?: 'checkout' | 'worktree';
        /** Post-impl: concrete discovery branch bound before author context source + baseBranch resolve. */
        effectiveDiscoveryBranch?: string;
        /** Post-impl: plan path skips composing post workspace hooks. */
        skipPostWorkspaceHooks?: boolean;
    } = {},
) {
    const { effectiveDiscoveryBranch, skipPostWorkspaceHooks, ...restOpts } = opts;
    return jsConfigToRunLumpInput({
        config: makeConfig(configOverrides),
        lumpName: restOpts.lumpName ?? 'my-lump',
        localConfigFolderPath: restOpts.localConfigFolderPath ?? DEFAULT_TEST_LOCAL_CONFIG,
        globalConfigFolderPath: restOpts.globalConfigFolderPath ?? DEFAULT_TEST_GLOBAL_CONFIG,
        projectBaseBranch: restOpts.projectBaseBranch ?? DEFAULT_TEST_PROJECT_BASE_BRANCH,
        executionWorkspacePath: restOpts.executionWorkspacePath ?? DEFAULT_TEST_WORKSPACE,
        workspaceStrategy: restOpts.workspaceStrategy ?? 'checkout',
        ...(effectiveDiscoveryBranch !== undefined ? { effectiveDiscoveryBranch } : {}),
        ...(skipPostWorkspaceHooks !== undefined ? { skipPostWorkspaceHooks } : {}),
    } as Parameters<typeof jsConfigToRunLumpInput>[0] & {
        effectiveDiscoveryBranch?: string;
        skipPostWorkspaceHooks?: boolean;
    });
}

export function resolveWithFixtures(
    configOverrides: Partial<LumpJsConfig>,
    opts: { lumpName?: string } = {},
) {
    return resolveJsConf(configOverrides, {
        ...opts,
        localConfigFolderPath: LOCAL_CONFIG_PATH,
        globalConfigFolderPath: GLOBAL_CONFIG_PATH,
    });
}

export function promptFnInput(variables: Record<string, string> = {}) {
    return { context: { name: 'ctx', variables }, stepIndex: 0, contextRunState: {}, lumpVariables: {} };
}

export const commandFnCallArgs = {
    context: { name: 'ctx', variables: {} },
    prompt: 'test',
    stepIndex: 0,
    contextRunState: {},
    lumpVariables: {},
    projectRoot: '/tmp',
    workspacePath: '/tmp',
} as const;

export function assertSuccess<T>(result: { success: true; data: T } | { success: false; data: string }): T {
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    return result.data;
}

export function assertFailure(
    result: { success: true; data: unknown } | { success: false; data: string },
    expected: string,
): void {
    expect(result.success).toBe(false);
    if (result.success) throw new Error('unreachable');
    expect(result.data).toBe(expected);
}
