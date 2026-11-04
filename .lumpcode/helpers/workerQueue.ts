import fs from 'node:fs/promises';
import path from 'node:path';

import { readYamlList } from '@lumpcode/cli-utils';

export const BACKLOG_LANES = ['backlog', 'docs', 'qol', 'bugfixes'] as const;
export type BacklogLane = (typeof BACKLOG_LANES)[number];

/**
 * Stop adding todo folders once a lane reaches this many desc.yml items.
 * Keep in step with the auto-triage and bug-hunter skills.
 */
export const LANE_TODO_CAP = 5;

const IDEAS_FILE = 'IDEAS.yaml';

type IdeaEntry = {
    name?: unknown;
    task?: unknown;
    blocked?: unknown;
};

export function utcDateContextName(now = new Date()): string {
    return now.toISOString().slice(0, 10);
}

export function laneTodoDir(lane: BacklogLane): string {
    return path.join('.lumpcode', 'lumps', lane, 'backlogItems', 'todo');
}

function isUnblockedIdea(entry: IdeaEntry): boolean {
    if (typeof entry.name !== 'string' || entry.name.trim() === '') return false;
    if (typeof entry.task !== 'string' || entry.task.trim() === '') return false;
    if (typeof entry.blocked === 'string' && entry.blocked.trim() !== '') return false;
    return true;
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function todoItemDirs(absTodoDir: string): Promise<string[]> {
    let entries;
    try {
        entries = await fs.readdir(absTodoDir, { withFileTypes: true });
    } catch {
        return [];
    }

    const dirs: string[] = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const itemDir = path.join(absTodoDir, entry.name);
        if (await fileExists(path.join(itemDir, 'desc.yml'))) {
            dirs.push(itemDir);
        }
    }
    return dirs;
}

export async function countDescTodos(input: {
    projectRoot: string;
    lane: BacklogLane;
}): Promise<number> {
    const absTodoDir = path.join(input.projectRoot, laneTodoDir(input.lane));
    const dirs = await todoItemDirs(absTodoDir);
    return dirs.length;
}

function laneHasRoom(count: number): boolean {
    return count < LANE_TODO_CAP;
}

async function hasTodoMissingRequirements(input: {
    projectRoot: string;
    lane: BacklogLane;
}): Promise<boolean> {
    const absTodoDir = path.join(input.projectRoot, laneTodoDir(input.lane));
    const dirs = await todoItemDirs(absTodoDir);
    for (const itemDir of dirs) {
        if (!(await fileExists(path.join(itemDir, 'requirements.md')))) {
            return true;
        }
    }
    return false;
}

export async function shouldRunAutoTriage(projectRoot: string): Promise<boolean> {
    const counts = await Promise.all(
        BACKLOG_LANES.map((lane) => countDescTodos({ projectRoot, lane })),
    );
    const anyRoom = counts.some((count) => laneHasRoom(count));
    const entries = await readYamlList<IdeaEntry>(path.join(projectRoot, IDEAS_FILE));
    if (entries.some(isUnblockedIdea) && anyRoom) {
        return true;
    }
    for (const lane of BACKLOG_LANES) {
        if (await hasTodoMissingRequirements({ projectRoot, lane })) {
            return true;
        }
    }
    return false;
}

export async function shouldRunBugHunter(projectRoot: string): Promise<boolean> {
    const count = await countDescTodos({ projectRoot, lane: 'bugfixes' });
    return laneHasRoom(count);
}
