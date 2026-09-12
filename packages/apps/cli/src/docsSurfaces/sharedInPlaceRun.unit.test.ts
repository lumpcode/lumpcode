import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../../');

const FORBIDDEN = [
    /project[-\s]copies/i,
    /project copy/i,
    /never touches this checkout/i,
    /never touches your checkout/i,
    /checkout untouched/i,
];

const USER_FACING_ROOTS = [
    path.join(repoRoot, 'packages/apps/cli/DOCS'),
    path.join(repoRoot, 'packages/apps/cli/README.md'),
    path.join(repoRoot, 'packages/apps/website/app/pages'),
    path.join(repoRoot, 'packages/apps/website/content/docs'),
    path.join(repoRoot, 'articles'),
    path.join(repoRoot, 'AGENTS.md'),
];

const TEXT_EXT = new Set(['.md', '.vue', '.html', '.txt']);

async function collectFiles(root: string): Promise<string[]> {
    const stat = await fs.stat(root).catch(() => undefined);
    if (!stat) return [];
    if (stat.isFile()) return TEXT_EXT.has(path.extname(root)) ? [root] : [];
    const out: string[] = [];
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.output' || entry.name === 'dist') {
            continue;
        }
        const full = path.join(root, entry.name);
        if (entry.isDirectory()) {
            out.push(...await collectFiles(full));
        } else if (TEXT_EXT.has(path.extname(entry.name))) {
            out.push(full);
        }
    }
    return out;
}

async function readRel(rel: string): Promise<string> {
    return fs.readFile(path.join(repoRoot, rel), 'utf-8');
}

/**
 * Parent shared-in-place-run AC12 / AC13 — user-facing copy and named owners.
 * Unskip during the implementation stage.
 */
describe.skip('shared in-place run docs and owners (shared-in-place-run)', () => {
    it('user-facing surfaces do not describe a shared project copy or untouched checkout', async () => {
        const files = (await Promise.all(USER_FACING_ROOTS.map(collectFiles))).flat();
        expect(files.length).toBeGreaterThan(10);
        const hits: string[] = [];
        for (const file of files) {
            const text = await fs.readFile(file, 'utf-8');
            for (const pattern of FORBIDDEN) {
                if (pattern.test(text)) {
                    hits.push(`${path.relative(repoRoot, file)}: ${pattern}`);
                }
            }
        }
        expect(hits).toEqual([]);
    });

    it('First PR teaches in-place rehearsal with c/e; worker stays the campaign clone', async () => {
        const firstPr = await readRel('packages/apps/website/app/pages/docs/start/first-pr.vue');
        expect(firstPr).toMatch(/this branch/i);
        expect(firstPr).toMatch(/dirty/i);
        expect(firstPr).toMatch(/type <code>c<\/code>/i);
        expect(firstPr).toMatch(/does not create a <code>lump\/…<\/code> branch/);
        expect(firstPr).not.toMatch(/project-copies|project copy/i);

        const worker = await readRel('packages/apps/website/app/pages/docs/start/worker.vue');
        expect(worker).toMatch(/rehearsal/);
        expect(worker).toMatch(/This clone is the campaign/);
    });

    it('landing hero does not teach rehearsal or write production', async () => {
        const landing = await readRel('packages/apps/website/app/pages/index.vue');
        const hero = landing.slice(0, landing.indexOf('class="wrap band"'));
        expect(hero).not.toMatch(/rehearsal/i);
        expect(hero).not.toMatch(/\bproduction\b/i);
        expect(landing).toMatch(/branch you open as a pull request/);
    });

    it('CLI concepts and local-config describe in-place shared run and dedicated-only start', async () => {
        const concepts = await readRel('packages/apps/cli/DOCS/concepts.md');
        expect(concepts).toMatch(/This checkout/);
        expect(concepts).toMatch(/sharedModeNoDaemon/);
        expect(concepts).toMatch(/\[c\]/);

        const local = await readRel('packages/apps/cli/DOCS/local-config.md');
        expect(local).toMatch(/This clone is the execution workspace/);
        expect(local).toMatch(/sharedModeNoDaemon/);
        expect(local).toMatch(/dirty/i);
    });

    it('promptSharedRunReview is only called from commands/run', async () => {
        const srcRoot = path.join(repoRoot, 'packages/apps/cli/src');
        const files = await collectTsSources(srcRoot);
        const callers = files.filter((file) => {
            if (file.includes(`${path.sep}promptSharedRunReview${path.sep}`)) return false;
            if (file.endsWith('.test.ts')) return false;
            return /promptSharedRunReview/.test(fsSync.readFileSync(file, 'utf-8'));
        });
        expect(callers.map((file) => path.relative(srcRoot, file)).sort()).toEqual([
            'commands/run/main.ts',
            'utils/index.ts',
        ]);
    });

    it('assertSharedRunHead is only called from runLumpFromJsConfig', async () => {
        const srcRoot = path.join(repoRoot, 'packages/apps/cli/src');
        const files = await collectTsSources(srcRoot);
        const callers = files.filter((file) => {
            if (file.includes(`${path.sep}assertSharedRunHead${path.sep}`)) return false;
            if (file.endsWith('.test.ts')) return false;
            return /assertSharedRunHead/.test(fsSync.readFileSync(file, 'utf-8'));
        });
        expect(callers.map((file) => path.relative(srcRoot, file)).sort()).toEqual([
            'utils/index.ts',
            'utils/runLumpFromJsConfig/main.ts',
        ]);
    });

    it('assertDedicatedDaemonRequired is only called from start, launchStartDaemon, and restart', async () => {
        const srcRoot = path.join(repoRoot, 'packages/apps/cli/src');
        const files = await collectTsSources(srcRoot);
        const callers = files.filter((file) => {
            if (file.includes(`${path.sep}assertDedicatedDaemonRequired${path.sep}`)) return false;
            if (file.endsWith('.test.ts')) return false;
            return /assertDedicatedDaemonRequired/.test(fsSync.readFileSync(file, 'utf-8'));
        });
        expect(callers.map((file) => path.relative(srcRoot, file)).sort()).toEqual([
            'commands/restart/main.ts',
            'commands/start/main.ts',
            'utils/index.ts',
            'utils/launchStartDaemon/main.ts',
        ]);
    });
});

async function collectTsSources(root: string): Promise<string[]> {
    const out: string[] = [];
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
        if (entry.name === 'testing' || entry.name === 'e2e') continue;
        const full = path.join(root, entry.name);
        if (entry.isDirectory()) {
            out.push(...await collectTsSources(full));
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
            out.push(full);
        }
    }
    return out;
}
