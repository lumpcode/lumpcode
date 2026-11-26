import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, vi, beforeEach, onTestFinished } from 'vitest';

import { getCodeBasePaths, type Context, type GetContextListFn } from '@lumpcode/core';

import type { ContextMatchFn, LumpJsConfig } from '../../../types';
import {
    assertFailure,
    assertSuccess,
    resolveJsConf,
    stubGetContextListFn,
} from './testHelpers';

// Post-impl: jsConfigToRunLumpInput gains optional effectiveDiscoveryBranch (concrete discovery bind).
describe('jsConfigToRunLumpInput dynamic-discovery-branch author bind + baseBranch (B*)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const DISCOVERY = 'feature/a';

    async function makeProjectRoot(files: Record<string, string> = {}): Promise<string> {
        const projectRoot = await mkdtemp(path.join(tmpdir(), 'lump-base-branch-'));
        onTestFinished(() => rm(projectRoot, { recursive: true, force: true }));
        for (const [rel, contents] of Object.entries(files)) {
            const abs = path.join(projectRoot, rel);
            await mkdir(path.dirname(abs), { recursive: true });
            await writeFile(abs, contents);
        }
        return projectRoot;
    }

    function projectResolveOpts(projectRoot: string) {
        return {
            effectiveDiscoveryBranch: DISCOVERY,
            localConfigFolderPath: path.join(projectRoot, '.lumpcode'),
        };
    }

    type BaseBranchFnInput = {
        effectiveDiscoveryBranch: string;
        contexts: Context[];
    };

    type BaseBranchFn = (input: BaseBranchFnInput) => string | Promise<string>;

    it('B1: omit baseBranch uses concrete effectiveDiscoveryBranch as RunLumpInput.baseBranch', async () => {
        const data = assertSuccess(
            await resolveJsConf(
                { getContextListFn: stubGetContextListFn },
                { effectiveDiscoveryBranch: DISCOVERY, projectBaseBranch: 'main' },
            ),
        );
        expect(data.baseBranch).toBe(DISCOVERY);
    });

    it('B2: string baseBranch exact passes through to core input', async () => {
        const data = assertSuccess(
            await resolveJsConf(
                { baseBranch: 'exec/line', getContextListFn: stubGetContextListFn },
                { effectiveDiscoveryBranch: DISCOVERY },
            ),
        );
        expect(data.baseBranch).toBe('exec/line');
    });

    it('B3: pattern string baseBranch fails at resolve', async () => {
        assertFailure(
            await resolveJsConf(
                { baseBranch: 'feature/*', getContextListFn: stubGetContextListFn },
                { effectiveDiscoveryBranch: DISCOVERY },
            ),
            'baseBranch must be a concrete branch name, not a pattern (got "feature/*")',
        );
    });

    it('B3b: BaseBranchFn returning a pattern fails at resolve and names the value', async () => {
        const projectRoot = await makeProjectRoot();
        const baseBranchFn: BaseBranchFn = () => 'exec/*';
        assertFailure(
            await resolveJsConf(
                {
                    baseBranch: baseBranchFn as LumpJsConfig['baseBranch'],
                    getContextListFn: stubGetContextListFn,
                },
                projectResolveOpts(projectRoot),
            ),
            'baseBranch function must return a non-empty concrete branch name, not a pattern (got "exec/*")',
        );
    });

    it('B4: BaseBranchFn sees pre-status raw contexts and returned string becomes baseBranch', async () => {
        const projectRoot = await makeProjectRoot();
        const recordedArgs: BaseBranchFnInput[] = [];
        const rawContexts: Context[] = [{ name: 'ctx-a', variables: { FILE: 'a.ts' } }];
        const authorGetContextListFn = vi.fn(() => rawContexts);
        const baseBranchFn: BaseBranchFn = (input) => {
            recordedArgs.push(input);
            return rawContexts[0] ? `exec/${rawContexts[0].name}` : input.effectiveDiscoveryBranch;
        };

        const data = assertSuccess(
            await resolveJsConf(
                {
                    getContextListFn: authorGetContextListFn,
                    baseBranch: baseBranchFn as LumpJsConfig['baseBranch'],
                },
                projectResolveOpts(projectRoot),
            ),
        );

        expect(recordedArgs).toHaveLength(1);
        expect(recordedArgs[0]).toEqual({
            effectiveDiscoveryBranch: DISCOVERY,
            contexts: rawContexts,
        });
        expect(data.baseBranch).toBe('exec/ctx-a');
    });

    it('B5: BaseBranchFn still called when author returns empty contexts', async () => {
        const projectRoot = await makeProjectRoot();
        const recordedArgs: BaseBranchFnInput[] = [];
        const authorGetContextListFn = vi.fn(() => [] as Context[]);
        const baseBranchFn: BaseBranchFn = (input) => {
            recordedArgs.push(input);
            return input.effectiveDiscoveryBranch;
        };

        const data = assertSuccess(
            await resolveJsConf(
                {
                    getContextListFn: authorGetContextListFn,
                    baseBranch: baseBranchFn as LumpJsConfig['baseBranch'],
                },
                projectResolveOpts(projectRoot),
            ),
        );

        expect(recordedArgs).toHaveLength(1);
        expect(recordedArgs[0]).toEqual({
            effectiveDiscoveryBranch: DISCOVERY,
            contexts: [],
        });
        expect(data.baseBranch).toBe(DISCOVERY);
    });

    it('B6: author getContextListFn invoked once after bind plus one core list fn call', async () => {
        let authorCalls = 0;
        const authorGetContextListFn = vi.fn(
            ({ discoveryBranch }: { discoveryBranch: string; codeBasePaths: unknown[]; lumpVariables: object }) => {
                authorCalls += 1;
                expect(discoveryBranch).toBe(DISCOVERY);
                return [{ name: 'ctx-a', variables: { FILE: 'a.ts' } }];
            },
        );

        const data = assertSuccess(
            await resolveJsConf(
                { getContextListFn: authorGetContextListFn as unknown as GetContextListFn },
                { effectiveDiscoveryBranch: DISCOVERY },
            ),
        );

        await data.getContextListFn({ codeBasePaths: [], lumpVariables: {} });
        expect(authorCalls).toBe(1);
    });

    it('B7: getContextListFn receives discoveryBranch at bind', async () => {
        const authorGetContextListFn = vi.fn(
            ({ discoveryBranch }: { discoveryBranch: string; codeBasePaths: unknown[]; lumpVariables: object }) => {
                expect(discoveryBranch).toBe(DISCOVERY);
                return [{ name: 'ctx-a', variables: { FILE: 'a.ts' } }];
            },
        );

        const data = assertSuccess(
            await resolveJsConf(
                { getContextListFn: authorGetContextListFn as unknown as GetContextListFn },
                { effectiveDiscoveryBranch: DISCOVERY },
            ),
        );

        await data.getContextListFn({ codeBasePaths: [], lumpVariables: {} });
        expect(authorGetContextListFn).toHaveBeenCalledOnce();
    });

    it('B8: contextMatchFn receives discoveryBranch on adapted getContextList path', async () => {
        const receivedDiscoveryBranches: string[] = [];
        const inputCodeBasePaths = [{ isDir: false, path: '/src/Button.ts' }];
        const contextMatchFn = ({
            codeBasePath,
            discoveryBranch,
        }: {
            codeBasePath: { isDir: boolean; path: string };
            codeBasePaths: typeof inputCodeBasePaths;
            lumpVariables: object;
            discoveryBranch: string;
        }) => {
            receivedDiscoveryBranches.push(discoveryBranch);
            if (!codeBasePath.path.endsWith('.ts')) return null;
            return {
                contextName: 'Button',
                filePathVariableName: 'FILE',
            };
        };

        const data = assertSuccess(
            await resolveJsConf(
                {
                    getContextListFn: undefined,
                    contextMatchFn: contextMatchFn as ContextMatchFn,
                },
                { effectiveDiscoveryBranch: DISCOVERY },
            ),
        );

        await data.getContextListFn({
            codeBasePaths: inputCodeBasePaths,
            lumpVariables: {},
        });
        // One match invocation per codeBasePath entry (fixture has a single path).
        expect(receivedDiscoveryBranches).toEqual([DISCOVERY]);
    });

    it('B9: function baseBranch sees path-template contexts from the project scan', async () => {
        const projectRoot = await makeProjectRoot({ 'src/index.ts': 'export {}\n' });
        const seen: Context[][] = [];
        const indexContext: Context = { name: 'index', variables: { FILE: 'src/index.ts' } };
        const baseBranchFn: BaseBranchFn = ({ contexts }) => {
            seen.push(contexts);
            return contexts.some((ctx) => ctx.name === 'index') ? 'dev' : 'main';
        };

        const data = assertSuccess(
            await resolveJsConf(
                {
                    getContextListFn: undefined,
                    contextMatchFn: undefined,
                    contextListJson: { FILE: 'src/{NAME}.ts' },
                    baseBranch: baseBranchFn as LumpJsConfig['baseBranch'],
                },
                projectResolveOpts(projectRoot),
            ),
        );

        expect(data.baseBranch).toBe('dev');
        expect(seen).toEqual([[indexContext]]);
        await expect(data.getContextListFn({
            codeBasePaths: [{ isDir: false, path: 'src/index.ts' }],
            lumpVariables: {},
        })).resolves.toEqual([indexContext]);
    });

    it('B10: string baseBranch does not scan and does not pin an empty context list', async () => {
        const missingRoot = path.join(tmpdir(), `lump-no-scan-${process.pid}-${Date.now()}`);
        const data = assertSuccess(
            await resolveJsConf(
                {
                    baseBranch: 'release',
                    getContextListFn: undefined,
                    contextMatchFn: undefined,
                    contextListJson: { FILE: 'src/{NAME}.ts' },
                },
                {
                    effectiveDiscoveryBranch: DISCOVERY,
                    localConfigFolderPath: path.join(missingRoot, '.lumpcode'),
                },
            ),
        );

        expect(data.baseBranch).toBe('release');
        await expect(data.getContextListFn({
            codeBasePaths: [{ isDir: false, path: 'src/index.ts' }],
            lumpVariables: {},
        })).resolves.toEqual([
            { name: 'index', variables: { FILE: 'src/index.ts' } },
        ]);
    });

    it('B11: function baseBranch fails resolve when the project scan fails', async () => {
        const missingRoot = path.join(tmpdir(), `lump-missing-scan-${process.pid}-${Date.now()}`);
        const scan = await getCodeBasePaths({ cwd: missingRoot });
        expect(scan.success).toBe(false);
        if (scan.success) throw new Error('unreachable');

        const baseBranchFn: BaseBranchFn = () => 'dev';
        assertFailure(
            await resolveJsConf(
                {
                    baseBranch: baseBranchFn as LumpJsConfig['baseBranch'],
                    getContextListFn: stubGetContextListFn,
                },
                {
                    effectiveDiscoveryBranch: DISCOVERY,
                    localConfigFolderPath: path.join(missingRoot, '.lumpcode'),
                },
            ),
            scan.data.message,
        );
    });
});
