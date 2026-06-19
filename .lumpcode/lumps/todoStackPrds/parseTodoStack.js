import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

async function prdFileExists(prdPath) {
    try {
        await fs.access(prdPath);
        return true;
    } catch {
        return false;
    }
}

function lumpStackFileRelativePath({ lumpName, fileName }) {
    return `.lumpcode/lumps/${lumpName}/${fileName}`;
}

function prdFileRelativePath({ lumpName, taskName }) {
    return `.lumpcode/lumps/${lumpName}/prds/${taskName}.prd.md`;
}

function* iterateTodoStackItems(doc) {
    if (!Array.isArray(doc)) {
        throw new Error('TODO.yml must be a flat list of tasks');
    }

    for (const item of doc) {
        if (!item.name) {
            throw new Error('TODO.yml task missing name');
        }

        yield item;
    }
}

export async function loadPendingTodoStackContexts({ lumpDir, lumpName }) {
    const todoStackPath = path.join(lumpDir, 'TODO.yml');
    const raw = await fs.readFile(todoStackPath, 'utf-8');
    const doc = yaml.load(raw);

    const todoStackFile = lumpStackFileRelativePath({ lumpName, fileName: 'TODO.yml' });
    const doneStackFile = lumpStackFileRelativePath({ lumpName, fileName: 'DONE.yml' });
    const contexts = [];

    for (const item of iterateTodoStackItems(doc)) {
        const dependsOnContexts = (item.dependsOn ?? []).map(name => `${name}_impl`);
        const prdPath = path.join(lumpDir, 'prds', `${item.name}.prd.md`);
        if (!(await prdFileExists(prdPath))) {
            continue;
        }

        contexts.push({
            name: `${item.name}_impl`,
            variables: {
                IMPLEMENT_PRD: true,
                TASK: item.task,
                TASK_PRIORITY: item.priority,
                TASK_NAME: item.name,
                PRD_FILE: prdFileRelativePath({ lumpName, taskName: item.name }),
                TODO_STACK_FILE: todoStackFile,
                DONE_STACK_FILE: doneStackFile,
            },
            options: {
                priority: item.priority,
                dependsOnContexts,
            },
        });
    }

    for (const item of iterateTodoStackItems(doc)) {
        const dependsOnContexts = (item.dependsOn ?? []).map(name => `${name}_impl`);
        const prdPath = path.join(lumpDir, 'prds', `${item.name}.prd.md`);
        if (await prdFileExists(prdPath)) {
            continue;
        }

        const variables = {
            TASK: item.task,
            TASK_PRIORITY: item.priority,
            TASK_NAME: item.name,
            PRD_FILE: prdFileRelativePath({ lumpName, taskName: item.name }),
            TODO_STACK_FILE: todoStackFile,
        };

        if (item.ref) {
            variables.REF = path.join(lumpDir, 'refs', item.ref);
        }

        contexts.push({
            name: item.name,
            variables,
            options: {
                priority: item.priority,
                dependsOnContexts,
            },
        });
    }

    return contexts;
}
