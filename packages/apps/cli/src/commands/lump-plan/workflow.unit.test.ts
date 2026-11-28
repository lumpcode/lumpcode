import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createTempTestDirs, initLocalGitRepo, removeTempTestDirs } from '../../utils';
import { writeJsonFile } from '../../utils/writeJsonFile';
import { command } from './main';

const BOTH = 'Use workflow or steps/prompt, not both.';
const JSON_ONLY = 'workflow needs a TypeScript or JavaScript config.';
const REGISTER_COMMANDS = 'registerCommands is not needed with workflow; presets load on first use.';

const STEPS_CONFIG_JS = `export default {
  getContextListFn: () => [{ name: 'alpha', variables: {} }],
  prompt: {
    promptFn: () => 'hello',
    commandFn: () => ({ executable: 'test-cli', args: [] }),
  },
};
`;

const WORKFLOW_CONFIG_JS = `export default {
  getContextListFn: () => [{ name: 'alpha', variables: {} }],
  async workflow() {
    return { message: 'ok' };
  },
};
`;

describe('lump-plan workflow', () => {
    async function withProject(run: (input: {
        projectRoot: string;
        localConfigFolderPath: string;
        globalConfigFolderPath: string;
        lumpDir: string;
        plan: (options: { json?: boolean; prompts?: boolean }) => ReturnType<ReturnType<typeof command.handlerMaker>>;
    }) => Promise<void>) {
        const dirs = await createTempTestDirs({ prefix: 'lump-plan-workflow-' });
        const { projectRoot, localConfigFolderPath, globalConfigFolderPath } = dirs;
        const lumpDir = path.join(localConfigFolderPath, 'lumps', 'my-lump');
        try {
            await fs.mkdir(lumpDir, { recursive: true });
            await writeJsonFile({
                filePath: path.join(localConfigFolderPath, 'local.json'),
                data: { mode: 'dedicated', primaryBranch: 'main' },
            });
            await writeJsonFile({
                filePath: path.join(localConfigFolderPath, 'project.json'),
                data: { projectName: 'plan-workflow-test' },
            });
            initLocalGitRepo({ cwd: projectRoot });
            await fs.writeFile(path.join(lumpDir, 'config.js'), STEPS_CONFIG_JS, 'utf-8');

            const handler = command.handlerMaker({
                projectRoot,
                localConfigFolderPath,
                globalConfigFolderPath: globalConfigFolderPath!,
            });
            await run({
                projectRoot,
                localConfigFolderPath,
                globalConfigFolderPath: globalConfigFolderPath!,
                lumpDir,
                plan: (options) => handler({
                    options,
                    arguments: { lumpName: 'my-lump' },
                }),
            });
        } finally {
            await removeTempTestDirs(dirs);
        }
    }

    function outputOf(result: Awaited<ReturnType<ReturnType<typeof command.handlerMaker>>>) {
        expect(result.success, result.success ? '' : result.data.messages.join('\n')).toBe(true);
        if (!result.success) throw new Error('unreachable');
        return result.data;
    }

    it('prints run: workflow and reports run in --json', async () => {
        await withProject(async ({ lumpDir, plan }) => {
            await fs.writeFile(path.join(lumpDir, 'config.js'), WORKFLOW_CONFIG_JS, 'utf-8');

            const human = outputOf(await plan({}));
            expect(human.messages.some((line) => line.trim() === 'run: workflow')).toBe(true);

            const json = outputOf(await plan({ json: true }));
            expect(json.data).toMatchObject({ valid: true, run: 'workflow' });
        });
    });

    it('reports run: steps for a steps lump and keeps the step summary', async () => {
        await withProject(async ({ plan }) => {
            const human = outputOf(await plan({}));
            expect(human.messages.some((line) => line.includes('run: workflow'))).toBe(false);
            expect(human.messages.some((line) => line.includes('is valid'))).toBe(true);

            const json = outputOf(await plan({ json: true }));
            expect(json.data).toMatchObject({ valid: true, run: 'steps' });

            const prompts = outputOf(await plan({ prompts: true }));
            expect(prompts.messages.some((line) => line.includes('step(s)'))).toBe(true);
        });
    });

    it('does not count workflow prompts as steps', async () => {
        await withProject(async ({ lumpDir, plan }) => {
            await fs.writeFile(path.join(lumpDir, 'config.js'), WORKFLOW_CONFIG_JS, 'utf-8');
            const prompts = outputOf(await plan({ prompts: true }));
            expect(prompts.messages.some((line) => line.trim() === 'run: workflow')).toBe(true);
            expect(prompts.messages.join('\n')).not.toMatch(/step\(s\)/);
        });
    });

    it('reports workflow with prompt or steps in text and --json', async () => {
        await withProject(async ({ lumpDir, plan }) => {
            await fs.writeFile(
                path.join(lumpDir, 'config.js'),
                `export default {
  getContextListFn: () => [{ name: 'alpha', variables: {} }],
  async workflow() { return { message: 'nope' }; },
  prompt: {
    promptFn: () => 'hello',
    commandFn: () => ({ executable: 'test-cli', args: [] }),
  },
};
`,
                'utf-8',
            );
            for (const json of [false, true]) {
                const result = await plan({ json });
                expect(result.success).toBe(false);
                if (result.success) throw new Error('unreachable');
                expect(result.data.messages.join('\n')).toContain(BOTH);
            }

            await fs.writeFile(
                path.join(lumpDir, 'config.js'),
                `export default {
  getContextListFn: () => [{ name: 'alpha', variables: {} }],
  async workflow() { return { message: 'nope' }; },
  steps: ['do it'],
};
`,
                'utf-8',
            );
            const result = await plan({});
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages.join('\n')).toContain(BOTH);
        });
    });

    it('reports a non-function workflow', async () => {
        await withProject(async ({ lumpDir, plan }) => {
            await fs.writeFile(
                path.join(lumpDir, 'config.js'),
                `export default {
  getContextListFn: () => [{ name: 'alpha', variables: {} }],
  workflow: 1,
};
`,
                'utf-8',
            );
            const result = await plan({ json: true });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages.join('\n')).toContain('workflow must be a function (got number).');
        });
    });

    it('reports workflow in config.json', async () => {
        await withProject(async ({ lumpDir, plan }) => {
            await fs.rm(path.join(lumpDir, 'config.js'));
            await writeJsonFile({
                filePath: path.join(lumpDir, 'config.json'),
                data: {
                    contextListJson: { NAME: '{NAME}.md' },
                    prompt: { promptTemplate: 'Hi', command: 'claude' },
                    workflow: './workflow.js',
                },
            });
            for (const json of [false, true]) {
                const result = await plan({ json });
                expect(result.success).toBe(false);
                if (result.success) throw new Error('unreachable');
                expect(result.data.messages.join('\n')).toContain(JSON_ONLY);
            }
        });
    });

    it('reports the registerCommands warning in text and --json', async () => {
        await withProject(async ({ lumpDir, plan }) => {
            await fs.writeFile(
                path.join(lumpDir, 'config.js'),
                `export default {
  getContextListFn: () => [{ name: 'alpha', variables: {} }],
  registerCommands: ['cursor'],
  async workflow() { return { message: 'ok' }; },
};
`,
                'utf-8',
            );
            const human = outputOf(await plan({}));
            expect(JSON.stringify(human)).toContain(REGISTER_COMMANDS);
            expect(human.messages.some((line) => line.trim() === 'run: workflow')).toBe(true);

            const json = outputOf(await plan({ json: true }));
            expect(JSON.stringify(json)).toContain(REGISTER_COMMANDS);
            expect(json.data).toMatchObject({ valid: true, run: 'workflow' });
        });
    });
});
