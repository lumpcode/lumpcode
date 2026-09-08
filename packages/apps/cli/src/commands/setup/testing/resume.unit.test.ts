import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as launchStartDaemonModule from '../../../utils/launchStartDaemon';
import * as planLumpFromJsConfigModule from '../../../utils/planLumpFromJsConfig';
import * as runLumpFromLumpNameModule from '../../../utils/runLumpFromLumpName';
import {
    DEFAULT_LUMP_NAME,
    dedicatedHappyPathPrompter,
    launchStartDaemonSuccess,
    lumpConfigPath,
    makeSetupHandler,
    planContextsSuccess,
    readJson,
    runLumpSuccess,
    setupSetupTestRepo,
    sharedJsonHappyPathPrompter,
    teardownSetupTestRepo,
    writeExistingProjectFiles,
    writeGlobalCommandModule,
    type SetupTestProject,
} from './testHelpers';

vi.mock('../../../utils/planLumpFromJsConfig', async () => {
    const actual = await vi.importActual<typeof planLumpFromJsConfigModule>(
        '../../../utils/planLumpFromJsConfig',
    );
    return { ...actual, planLumpFromJsConfig: vi.fn() };
});

vi.mock('../../../utils/runLumpFromLumpName', async () => {
    const actual = await vi.importActual<typeof runLumpFromLumpNameModule>(
        '../../../utils/runLumpFromLumpName',
    );
    return { ...actual, runLumpFromLumpName: vi.fn() };
});

vi.mock('../../../utils/launchStartDaemon', async () => {
    const actual = await vi.importActual<typeof launchStartDaemonModule>(
        '../../../utils/launchStartDaemon',
    );
    return { ...actual, launchStartDaemon: vi.fn() };
});

describe.skip('setup command resume (lumpcode-setup)', () => {
    let project: SetupTestProject;

    beforeEach(async () => {
        project = await setupSetupTestRepo({ tmpPrefix: 'lump-setup-resume' });
        await writeGlobalCommandModule(project.homeDir, 'my-agent');
        vi.mocked(planLumpFromJsConfigModule.planLumpFromJsConfig).mockResolvedValue(
            planContextsSuccess({ projectRoot: project.projectRoot }),
        );
        vi.mocked(runLumpFromLumpNameModule.runLumpFromLumpName).mockResolvedValue(runLumpSuccess());
        vi.mocked(launchStartDaemonModule.launchStartDaemon).mockResolvedValue(launchStartDaemonSuccess());
    });

    afterEach(async () => {
        await teardownSetupTestRepo(project);
        vi.clearAllMocks();
    });

    it('does not rewrite a valid existing project.json', async () => {
        await writeExistingProjectFiles({
            projectRoot: project.projectRoot,
            projectJson: { projectName: 'keep-me', primaryBranch: 'develop' },
            lumpName: DEFAULT_LUMP_NAME,
        });
        const before = await fs.readFile(
            path.join(project.projectRoot, '.lumpcode', 'project.json'),
            'utf-8',
        );

        const result = await makeSetupHandler({ prompter: sharedJsonHappyPathPrompter() })({
            options: { projectPath: project.projectRoot },
            arguments: {},
        });
        expect(result.success).toBe(true);

        const after = await fs.readFile(
            path.join(project.projectRoot, '.lumpcode', 'project.json'),
            'utf-8',
        );
        expect(after).toBe(before);
        expect(JSON.parse(after)).toEqual({
            projectName: 'keep-me',
            primaryBranch: 'develop',
        });
    });

    it('merges mode/strategy onto local.json and keeps extra keys', async () => {
        await writeExistingProjectFiles({
            projectRoot: project.projectRoot,
            localJson: {
                mode: 'shared',
                keepHistory: true,
                verbose: true,
                refreshCommand: 'echo hi',
            },
            lumpName: DEFAULT_LUMP_NAME,
        });

        const prompter = dedicatedHappyPathPrompter({
            confirm: (input) => {
                if (/wipe|reset|this checkout/i.test(input.message)) return true;
                if (/worker|daemon|leave/i.test(input.message)) return false;
                if (/skill/i.test(input.message)) return false;
                if (/run/i.test(input.message)) return true;
                return input.defaultValue;
            },
            select: (input) => {
                if (/mode/i.test(input.message)) return 'dedicated';
                if (/strategy|checkout|worktree/i.test(input.message)) return 'worktree';
                if (/commit|push/i.test(input.message)) return 'manual';
                return input.choices[0]!.value;
            },
            input: (input) => {
                if (/parallel|maxParallel/i.test(input.message)) return '3';
                return input.defaultValue ?? '';
            },
        });

        const result = await makeSetupHandler({ prompter })({
            options: { projectPath: project.projectRoot },
            arguments: {},
        });
        expect(result.success).toBe(true);

        const localJson = await readJson(path.join(project.projectRoot, '.lumpcode', 'local.json')) as {
            mode: string;
            workspaceStrategy?: string;
            maxParallelRun?: number;
            keepHistory?: boolean;
            verbose?: boolean;
            refreshCommand?: string;
        };
        expect(localJson.mode).toBe('dedicated');
        expect(localJson.workspaceStrategy).toBe('worktree');
        expect(localJson.maxParallelRun).toBe(3);
        expect(localJson.keepHistory).toBe(true);
        expect(localJson.verbose).toBe(true);
        expect(localJson.refreshCommand).toBe('echo hi');
    });

    it('skips stub write when a lump config already exists, but still pauses to edit', async () => {
        const existingStub = {
            contextListJson: { FILE: 'docs/guide.md' },
            prompt: { promptTemplate: 'leave me alone', command: 'cursor' },
        };
        await writeExistingProjectFiles({
            projectRoot: project.projectRoot,
            lumpName: 'alreadyThere',
            lumpConfig: existingStub,
        });
        const configPath = lumpConfigPath(project.projectRoot, 'alreadyThere', 'json');
        const before = await fs.readFile(configPath, 'utf-8');

        const prompter = sharedJsonHappyPathPrompter();
        const result = await makeSetupHandler({ prompter })({
            options: { projectPath: project.projectRoot },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        expect(await fs.readFile(configPath, 'utf-8')).toBe(before);
        await expect(fs.access(lumpConfigPath(project.projectRoot, DEFAULT_LUMP_NAME, 'json')))
            .rejects.toMatchObject({ code: 'ENOENT' });

        expect(prompter.calls.some((c) => c.kind === 'select' && /format|json/i.test(c.message))).toBe(false);
        expect(prompter.calls.some((c) => c.kind === 'pause')).toBe(true);
        expect(prompter.calls.some((c) => c.kind === 'select' && /commit|push/i.test(c.message))).toBe(true);
        expect(result.data.data?.lumpName).toBe('alreadyThere');
    });

    it('still asks this machine for mode/strategy even when .lumpcode/ already exists', async () => {
        await writeExistingProjectFiles({
            projectRoot: project.projectRoot,
            lumpName: DEFAULT_LUMP_NAME,
        });
        const prompter = sharedJsonHappyPathPrompter();
        const result = await makeSetupHandler({ prompter })({
            options: { projectPath: project.projectRoot },
            arguments: {},
        });
        expect(result.success).toBe(true);
        expect(prompter.calls.some((c) => c.kind === 'select' && /mode/i.test(c.message))).toBe(true);
        expect(prompter.calls.some((c) =>
            c.kind === 'select' && /strategy|checkout|worktree/i.test(c.message),
        )).toBe(true);
    });
});
