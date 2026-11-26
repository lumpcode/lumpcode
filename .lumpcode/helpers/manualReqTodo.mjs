import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { load as loadYaml } from 'js-yaml';

const execFileAsync = promisify(execFile);

const LANES = ['backlog', 'docs', 'qol', 'bugfixes'];

/** True when desc.yml `workflow` contains the `manualReq` stage. A boolean field does not count. */
export function descYamlHasManualReq(raw) {
    let doc;
    try {
        doc = loadYaml(raw);
    } catch {
        return false;
    }
    if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
        return false;
    }
    return Array.isArray(doc.workflow) && doc.workflow.includes('manualReq');
}

export async function readDescYamlHasManualReq(descPath) {
    try {
        const raw = await readFile(descPath, 'utf8');
        return descYamlHasManualReq(raw);
    } catch {
        return false;
    }
}

/** A desc-only todo still needs auto-triage unless its workflow contains `manualReq`. */
export async function itemNeedsAutoTriageRequirements(itemDir) {
    try {
        await readFile(path.join(itemDir, 'requirements.md'));
        return false;
    } catch {
        return !(await readDescYamlHasManualReq(path.join(itemDir, 'desc.yml')));
    }
}

function todoItemKey(relPath) {
    const parts = relPath.replaceAll('\\', '/').split('/');
    if (parts.length < 6) return null;
    if (parts[0] !== '.lumpcode' || parts[1] !== 'lumps') return null;
    if (parts[3] !== 'backlogItems' || parts[4] !== 'todo') return null;
    if (!LANES.includes(parts[2])) return null;
    return `${parts[2]}/${parts[5]}`;
}

function unquoteStatusPath(payload) {
    const trimmed = payload.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

function pathsFromStatus(porcelain) {
    const paths = [];
    for (const line of porcelain.split('\n')) {
        if (line.length < 4) continue;
        const payload = unquoteStatusPath(line.slice(3));
        const arrow = payload.indexOf(' -> ');
        if (arrow !== -1) {
            paths.push(payload.slice(0, arrow), payload.slice(arrow + 4));
        } else {
            paths.push(payload);
        }
    }
    return paths;
}

/**
 * Todo items changed in the working tree whose HEAD `desc.yml` workflow contains `manualReq`.
 * A folder that does not exist at HEAD is a new item, not one of these.
 */
export async function findTouchedManualReqTodos(projectRoot) {
    const pathspecs = LANES.map((lane) => `.lumpcode/lumps/${lane}/backlogItems/todo`);
    let porcelain;
    try {
        const { stdout } = await execFileAsync(
            'git',
            ['status', '--porcelain=v1', '-uall', '--', ...pathspecs],
            { cwd: projectRoot },
        );
        porcelain = stdout;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`git status failed: ${message}`);
    }

    const keys = new Set();
    for (const rel of pathsFromStatus(porcelain)) {
        const key = todoItemKey(rel);
        if (key) keys.add(key);
    }

    const touched = [];
    for (const key of keys) {
        const [lane, item] = key.split('/');
        const rel = `.lumpcode/lumps/${lane}/backlogItems/todo/${item}/desc.yml`;
        let raw;
        try {
            const { stdout } = await execFileAsync('git', ['show', `HEAD:${rel}`], { cwd: projectRoot });
            raw = stdout;
        } catch {
            continue;
        }
        if (descYamlHasManualReq(raw)) {
            touched.push(key);
        }
    }
    touched.sort();
    return touched;
}

function isDirectRun() {
    const entry = process.argv[1];
    if (!entry) return false;
    try {
        return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return pathToFileURL(entry).href === import.meta.url;
    }
}

if (isDirectRun()) {
    try {
        const found = await findTouchedManualReqTodos(process.cwd());
        if (found.length > 0) {
            console.log(`auto-triage must leave manualReq todos alone: ${found.join(', ')}`);
            process.exit(1);
        }
    } catch (error) {
        console.log(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
