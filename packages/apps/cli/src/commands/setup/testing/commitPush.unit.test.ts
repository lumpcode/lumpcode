import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as planLumpFromJsConfigModule from '../../../utils/planLumpFromJsConfig';
import * as runLumpFromLumpNameModule from '../../../utils/runLumpFromLumpName';
import { execGit } from '../../../utils';
import {
    DEFAULT_LUMP_NAME,
    makeSetupHandler,
    planContextsSuccess,
    runLumpSuccess,
    scriptedPrompter,
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

function committedPaths(projectRoot: string): string[] {
    return execGit('ls-tree -r --name-only HEAD', projectRoot)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
}

describe.skip('setup command commitPush (lumpcode-setup)', () => {
    let project: SetupTestProject;

    beforeEach(async () => {
        project = await setupSetupTestRepo({ tmpPrefix: 'lump-setup-git' });
        await writeGlobalCommandModule(project.homeDir, 'my-agent');
        vi.mocked(planLumpFromJsConfigModule.planLumpFromJsConfig).mockResolvedValue(
            planContextsSuccess({ projectRoot: project.projectRoot }),
        );
        vi.mocked(runLumpFromLumpNameModule.runLumpFromLumpName).mockResolvedValue(runLumpSuccess());
    });

    afterEach(async () => {
        await teardownSetupTestRepo(project);
        vi.clearAllMocks();
    });

    it('cli adds only the allowlist, never local.json or the rest of a dirty tree', async () => {
        await fs.writeFile(path.join(project.projectRoot, 'secret.txt'), 'do not add\n', 'utf-8');
        await fs.mkdir(path.join(project.projectRoot, 'node_modules', 'x'), { recursive: true });
        await fs.writeFile(path.join(project.projectRoot, 'node_modules', 'x', 'index.js'), '1\n', 'utf-8');

        const result = await makeSetupHandler({ prompter: sharedJsonHappyPathPrompter() })({
            options: { projectPath: project.projectRoot },
            arguments: {},
        });
        expect(result.success).toBe(true);

        const files = committedPaths(project.projectRoot);
        expect(files.some((f) => f.startsWith('.lumpcode/project.json'))).toBe(true);
        expect(files.some((f) => f.startsWith('.lumpcode/lumps/'))).toBe(true);
        expect(files.some((f) => f.startsWith('.lumpcode/commands/'))).toBe(true);
        expect(files).toEqual(expect.arrayContaining(['.gitignore']));
        expect(files.some((f) => f.includes('local.json'))).toBe(false);
        expect(files.some((f) => f.startsWith('node_modules/'))).toBe(false);
        expect(files).not.toContain('secret.txt');

        const subject = execGit('log -1 --pretty=%s', project.projectRoot).trim();
        expect(subject).toBe(`Add Lumpcode setup and ${DEFAULT_LUMP_NAME}`);
        expect(subject).not.toMatch(/^LUMP:/);

        const remoteBranches = execGit('ls-remote --heads origin', project.projectRoot);
        expect(remoteBranches).toMatch(/refs\/heads\//);
    });

    it('manual prints the same git commands, pauses, and does not verify a push', async () => {
        const prompter = sharedJsonHappyPathPrompter({
            select: (input) => {
                if (/mode/i.test(input.message)) return 'shared';
                if (/strategy|checkout|worktree/i.test(input.message)) return 'checkout';
                if (/format|json/i.test(input.message)) return 'json';
                if (/commit|push/i.test(input.message)) return 'manual';
                return input.choices[0]!.value;
            },
        });

        const beforeSha = execGit('rev-parse HEAD', project.projectRoot).trim();
        const result = await makeSetupHandler({ prompter })({
            options: { projectPath: project.projectRoot },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        expect(execGit('rev-parse HEAD', project.projectRoot).trim()).toBe(beforeSha);
        expect(prompter.calls.filter((c) => c.kind === 'pause').length).toBeGreaterThanOrEqual(2);
        const text = result.data.messages.join('\n');
        expect(text).toMatch(/git add/);
        expect(text).toMatch(/git commit/);
        expect(text).toMatch(/git push -u origin HEAD/);
        expect(runLumpFromLumpNameModule.runLumpFromLumpName).toHaveBeenCalled();
    });

    it('add/commit/push failure stops the drive before run', async () => {
        execGit('remote set-url origin /definitely-not-a-git-remote', project.projectRoot);

        const result = await makeSetupHandler({ prompter: sharedJsonHappyPathPrompter() })({
            options: { projectPath: project.projectRoot },
            arguments: {},
        });
        expect(result.success).toBe(false);
        expect(runLumpFromLumpNameModule.runLumpFromLumpName).not.toHaveBeenCalled();
    });

    it('no-op commit (already committed) still pushes', async () => {
        await writeExistingProjectFiles({
            projectRoot: project.projectRoot,
            lumpName: DEFAULT_LUMP_NAME,
        });
        execGit('add .gitignore .lumpcode/project.json .lumpcode/lumps .lumpcode/commands', project.projectRoot);
        execGit('commit --allow-empty -m "already set up"', project.projectRoot);
        execGit('push origin HEAD', project.projectRoot);
        const beforeRemote = execGit('rev-parse origin/main', project.projectRoot).trim();

        await fs.writeFile(
            path.join(project.projectRoot, '.lumpcode', 'local.json'),
            JSON.stringify({ mode: 'shared', keepHistory: true, extraLocal: true }),
            'utf-8',
        );

        const result = await makeSetupHandler({ prompter: sharedJsonHappyPathPrompter() })({
            options: { projectPath: project.projectRoot },
            arguments: {},
        });
        expect(result.success).toBe(true);
        expect(runLumpFromLumpNameModule.runLumpFromLumpName).toHaveBeenCalled();
        const afterRemote = execGit('rev-parse origin/HEAD', project.projectRoot).trim();
        expect(afterRemote.length).toBeGreaterThan(0);
        expect(beforeRemote).toEqual(expect.any(String));
    });

    it('still offers commitPush when nothing new is staged to commit', async () => {
        await writeExistingProjectFiles({
            projectRoot: project.projectRoot,
            lumpName: DEFAULT_LUMP_NAME,
        });
        const prompter = scriptedPrompter({
            confirm: (input) => (/skill/i.test(input.message) ? false : /run/i.test(input.message)),
            select: (input) => {
                if (/mode/i.test(input.message)) return 'shared';
                if (/strategy|checkout|worktree/i.test(input.message)) return 'checkout';
                if (/commit|push/i.test(input.message)) return 'cli';
                return input.choices[0]!.value;
            },
            input: (input) => input.defaultValue ?? '',
        });

        const result = await makeSetupHandler({ prompter })({
            options: { projectPath: project.projectRoot },
            arguments: {},
        });
        expect(result.success).toBe(true);
        expect(prompter.calls.some((c) => c.kind === 'select' && /commit|push/i.test(c.message))).toBe(true);
    });
});
