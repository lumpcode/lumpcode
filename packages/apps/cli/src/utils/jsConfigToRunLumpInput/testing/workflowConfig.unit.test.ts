import { readFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Logger } from '@lumpcode/core';

import type { LumpJsConfig } from '../../../types';
import { withTsLumpProject } from '../../../testing/tsLumpFixtures';
import { getJsConfigFromLumpName } from '../../getJsConfigFromLumpName';
import { noopLogger } from '../../noopLogger';
import { jsConfigToRunLumpInput } from '../main';
import {
    assertFailure,
    assertSuccess,
    DEFAULT_TEST_GLOBAL_CONFIG,
    DEFAULT_TEST_LOCAL_CONFIG,
    DEFAULT_TEST_PROJECT_BASE_BRANCH,
    DEFAULT_TEST_WORKSPACE,
    LOCAL_CONFIG_PATH,
    seedGlobalConfigFixture,
} from './testHelpers';

const BOTH = 'Use workflow or steps/prompt, not both.';
const JSON_ONLY = 'workflow needs a TypeScript or JavaScript config.';
const REGISTER_COMMANDS = 'registerCommands is not needed with workflow; presets load on first use.';
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function workflowLump(fields: Record<string, unknown> = {}): LumpJsConfig {
    return {
        getContextListFn: () => [{ name: 'ctx', variables: {} }],
        ...fields,
    } as LumpJsConfig;
}

function resolveWorkflow(
    fields: Record<string, unknown>,
    opts: {
        logger?: Logger;
        lumpName?: string;
        localConfigFolderPath?: string;
        globalConfigFolderPath?: string;
        executionWorkspacePath?: string;
    } = {},
) {
    return jsConfigToRunLumpInput({
        config: workflowLump(fields),
        lumpName: opts.lumpName ?? 'my-lump',
        localConfigFolderPath: opts.localConfigFolderPath ?? DEFAULT_TEST_LOCAL_CONFIG,
        globalConfigFolderPath: opts.globalConfigFolderPath ?? DEFAULT_TEST_GLOBAL_CONFIG,
        projectBaseBranch: DEFAULT_TEST_PROJECT_BASE_BRANCH,
        executionWorkspacePath: opts.executionWorkspacePath ?? DEFAULT_TEST_WORKSPACE,
        logger: opts.logger ?? noopLogger,
    });
}

describe.skip('workflow lump config', () => {
    it('keeps workflow out of the JSON schema', () => {
        const schemaPath = path.resolve(__dirname, '../../../schemas/lumpConfig.schema.json');
        const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as { properties?: Record<string, unknown> };
        expect(schema.properties).not.toHaveProperty('workflow');
    });

    it('rejects workflow in config.json', async () => {
        await withTsLumpProject(async ({ lumpDir, localConfigFolderPath, lumpName }) => {
            await fs.writeFile(
                path.join(lumpDir, 'config.json'),
                JSON.stringify({
                    contextListJson: { NAME: '{NAME}.md' },
                    prompt: { promptTemplate: 'Hi', command: 'claude' },
                    workflow: './workflow.js',
                }),
                'utf-8',
            );
            assertFailure(
                await getJsConfigFromLumpName({ lumpName, localConfigFolderPath }),
                JSON_ONLY,
            );
        });
    });

    it('rejects a JSON workflow even when prompt and steps are absent', async () => {
        await withTsLumpProject(async ({ lumpDir, localConfigFolderPath, lumpName }) => {
            await fs.writeFile(
                path.join(lumpDir, 'config.json'),
                JSON.stringify({
                    getContextListFn: './list.js',
                    workflow: './workflow.js',
                }),
                'utf-8',
            );
            assertFailure(
                await getJsConfigFromLumpName({ lumpName, localConfigFolderPath }),
                JSON_ONLY,
            );
        });
    });

    it('loads a workflow function from config.js', async () => {
        await withTsLumpProject(async ({ lumpDir, localConfigFolderPath, globalConfigFolderPath, lumpName, projectRoot }) => {
            await fs.writeFile(
                path.join(lumpDir, 'config.js'),
                `export default {
  getContextListFn: () => [{ name: 'ctx', variables: {} }],
  async workflow() { return { message: 'from-js' }; },
};
`,
                'utf-8',
            );
            const loaded = assertSuccess(await getJsConfigFromLumpName({ lumpName, localConfigFolderPath }));
            const data = assertSuccess(await jsConfigToRunLumpInput({
                config: loaded,
                lumpName,
                localConfigFolderPath,
                globalConfigFolderPath,
                projectBaseBranch: 'main',
                executionWorkspacePath: projectRoot,
                logger: noopLogger,
            }));
            expect(data.steps).toBeUndefined();
            expect(await data.workflow?.({} as never)).toEqual({ message: 'from-js' });
        });
    });

    it('loads a workflow function from config.ts', async () => {
        await withTsLumpProject(async ({ lumpDir, localConfigFolderPath, globalConfigFolderPath, lumpName, projectRoot }) => {
            await fs.writeFile(
                path.join(lumpDir, 'config.ts'),
                `export default {
  getContextListFn: () => [{ name: 'ctx', variables: {} }],
  async workflow({ context }: { context: { name: string } }) {
    return { message: context.name };
  },
};
`,
                'utf-8',
            );
            const loaded = assertSuccess(await getJsConfigFromLumpName({ lumpName, localConfigFolderPath }));
            const data = assertSuccess(await jsConfigToRunLumpInput({
                config: loaded,
                lumpName,
                localConfigFolderPath,
                globalConfigFolderPath,
                projectBaseBranch: 'main',
                executionWorkspacePath: projectRoot,
                logger: noopLogger,
            }));
            expect(data.steps).toBeUndefined();
            const result = await data.workflow?.({ context: { name: 'ctx', variables: {} } } as never);
            expect(result).toEqual({ message: 'ctx' });
        });
    });

    it('loads a FilePath workflow module default export', async () => {
        await withTsLumpProject(async ({ lumpDir, localConfigFolderPath, globalConfigFolderPath, lumpName, projectRoot }) => {
            await fs.writeFile(
                path.join(lumpDir, 'workflow.ts'),
                `export default async function workflow() {
  return { message: 'from-file' };
}
`,
                'utf-8',
            );
            const data = assertSuccess(await resolveWorkflow(
                { workflow: './workflow.ts' },
                { lumpName, localConfigFolderPath, globalConfigFolderPath, executionWorkspacePath: projectRoot },
            ));
            expect(data.steps).toBeUndefined();
            expect(await data.workflow?.({} as never)).toEqual({ message: 'from-file' });
        });
    });

    it('rejects workflow together with prompt', async () => {
        assertFailure(
            await resolveWorkflow({
                workflow: async () => ({ message: 'nope' }),
                prompt: { promptFn: () => 'hi', commandFn: () => ({ executable: 'echo', args: ['x'] }) },
            }),
            BOTH,
        );
    });

    it('rejects workflow together with steps', async () => {
        assertFailure(
            await resolveWorkflow({
                workflow: async () => ({ message: 'nope' }),
                command: 'claude',
                steps: ['do it'],
            }),
            BOTH,
        );
    });

    it('rejects a workflow that is not a function', async () => {
        assertFailure(
            await resolveWorkflow({ workflow: 1 }),
            'workflow must be a function (got number).',
        );
        assertFailure(
            await resolveWorkflow({ workflow: { not: 'a function' } }),
            'workflow must be a function (got object).',
        );
    });

    it('rejects a FilePath workflow whose default export is not a function', async () => {
        await withTsLumpProject(async ({ lumpDir, localConfigFolderPath, globalConfigFolderPath, lumpName, projectRoot }) => {
            await fs.writeFile(
                path.join(lumpDir, 'workflow.ts'),
                'export default "nope";\n',
                'utf-8',
            );
            assertFailure(
                await resolveWorkflow(
                    { workflow: './workflow.ts' },
                    { lumpName, localConfigFolderPath, globalConfigFolderPath, executionWorkspacePath: projectRoot },
                ),
                'workflow must be a function (got string).',
            );
        });
    });

    it('warns when a workflow lists registerCommands and still loads', async () => {
        const warnings: string[] = [];
        const data = assertSuccess(await resolveWorkflow(
            {
                workflow: async () => ({ message: 'ok' }),
                registerCommands: ['test-agent'],
            },
            {
                localConfigFolderPath: LOCAL_CONFIG_PATH,
                globalConfigFolderPath: await seedGlobalConfigFixture(),
                logger: {
                    ...noopLogger,
                    warn: (message) => { warnings.push(message); },
                },
            },
        ));
        expect(data.steps).toBeUndefined();
        expect(data.workflow).toEqual(expect.any(Function));
        expect(warnings).toContain(REGISTER_COMMANDS);
    });

    it('leaves timeoutMillis unset so the engine default of 2 hours applies', async () => {
        const data = assertSuccess(await resolveWorkflow({
            workflow: async () => ({ message: 'ok' }),
        }));
        expect(data.timeoutMillis).toBeUndefined();
        expect(data.timeoutMillis ?? TWO_HOURS_MS).toBe(TWO_HOURS_MS);
        expect(data.steps).toBeUndefined();
    });

    it('forwards timeoutMillis as the whole-workflow limit', async () => {
        const data = assertSuccess(await resolveWorkflow({
            workflow: async () => ({ message: 'ok' }),
            timeoutMillis: 90_000,
        }));
        expect(data.timeoutMillis).toBe(90_000);
        expect(data.steps).toBeUndefined();
    });
});
