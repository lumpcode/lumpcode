import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { descYamlHasManualReq, findTouchedManualReqTodos, itemNeedsAutoTriageRequirements } from '../.lumpcode/helpers/manualReqTodo.mjs';

const execFileAsync = promisify(execFile);

const roots = [];

afterEach(() => {
    for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

function tempRoot() {
    const root = mkdtempSync(join(tmpdir(), 'lumpcode-manual-req-'));
    roots.push(root);
    return root;
}

async function git(cwd, args) {
    await execFileAsync('git', args, { cwd });
}

async function initRepo(root) {
    await git(root, ['init']);
    await git(root, ['config', 'user.email', 'test@example.com']);
    await git(root, ['config', 'user.name', 'Test']);
}

function writeTodo(root, lane, name, desc) {
    const dir = join(root, '.lumpcode', 'lumps', lane, 'backlogItems', 'todo', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'desc.yml'), desc);
    return dir;
}

describe('descYamlHasManualReq', () => {
    it('is true only when workflow contains the stage', () => {
        expect(descYamlHasManualReq('workflow: [manualReq, impl]\n')).toBe(true);
        expect(descYamlHasManualReq('workflow: [req, impl]\n')).toBe(false);
        expect(descYamlHasManualReq('manualReq: true\nworkflow: [impl]\n')).toBe(false);
        expect(descYamlHasManualReq('task: mentions manualReq in prose\nworkflow: [impl]\n')).toBe(false);
    });
});

describe('findTouchedManualReqTodos', () => {
    it('reports a changed manualReq todo and ignores other todos', async () => {
        const root = tempRoot();
        await initRepo(root);
        writeTodo(root, 'backlog', 'human', 'name: human\nworkflow: [manualReq, impl]\ntask: wait\npriority: 1\n');
        writeTodo(root, 'qol', 'agent', 'name: agent\nworkflow: [impl]\ntask: go\npriority: 1\n');
        await git(root, ['add', '.']);
        await git(root, ['commit', '-m', 'base']);

        writeFileSync(
            join(root, '.lumpcode/lumps/backlog/backlogItems/todo/human/desc.yml'),
            'name: human\nworkflow: [manualReq, impl]\ntask: edited\npriority: 1\n',
        );
        writeFileSync(
            join(root, '.lumpcode/lumps/qol/backlogItems/todo/agent/desc.yml'),
            'name: agent\nworkflow: [impl]\ntask: edited\npriority: 1\n',
        );

        await expect(findTouchedManualReqTodos(root)).resolves.toEqual(['backlog/human']);
    });

    it('reports a deleted manualReq todo and ignores a new one', async () => {
        const root = tempRoot();
        await initRepo(root);
        writeTodo(root, 'backlog', 'human', 'name: human\nworkflow: [manualReq, impl]\ntask: wait\npriority: 1\n');
        await git(root, ['add', '.']);
        await git(root, ['commit', '-m', 'base']);

        rmSync(join(root, '.lumpcode/lumps/backlog/backlogItems/todo/human'), { recursive: true });
        writeTodo(root, 'backlog', 'fresh', 'name: fresh\nworkflow: [manualReq, impl]\ntask: new\npriority: 1\n');

        await expect(findTouchedManualReqTodos(root)).resolves.toEqual(['backlog/human']);
    });
});

describe('itemNeedsAutoTriageRequirements', () => {
    it('is false for a manualReq todo with no requirements.md', async () => {
        const root = tempRoot();
        const dir = writeTodo(root, 'backlog', 'human', 'name: human\nworkflow: [manualReq, impl]\ntask: wait\npriority: 1\n');
        await expect(itemNeedsAutoTriageRequirements(dir)).resolves.toBe(false);
    });

    it('is true for another todo with no requirements.md', async () => {
        const root = tempRoot();
        const dir = writeTodo(root, 'qol', 'agent', 'name: agent\nworkflow: [impl]\ntask: go\npriority: 1\n');
        await expect(itemNeedsAutoTriageRequirements(dir)).resolves.toBe(true);
    });

    it('is false once requirements.md exists', async () => {
        const root = tempRoot();
        const dir = writeTodo(root, 'qol', 'agent', 'name: agent\nworkflow: [impl]\ntask: go\npriority: 1\n');
        writeFileSync(join(dir, 'requirements.md'), '# Requirements\n');
        await expect(itemNeedsAutoTriageRequirements(dir)).resolves.toBe(false);
    });
});
