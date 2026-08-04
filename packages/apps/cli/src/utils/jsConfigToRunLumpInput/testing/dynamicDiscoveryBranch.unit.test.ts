import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Context, GetContextListFn } from '@lumpcode/core';

import type { ContextMatchFn, LumpJsConfig } from '../../../types';
import {
    assertFailure,
    assertSuccess,
    resolveJsConf,
    stubGetContextListFn,
} from './testHelpers';

// Post-impl: jsConfigToRunLumpInput gains optional effectiveDiscoveryBranch (concrete discovery bind).
describe.skip('jsConfigToRunLumpInput dynamic-discovery-branch author bind + baseBranch (B*)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const DISCOVERY = 'feature/a';

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
            'baseBranch must be a concrete branch name',
        );
    });

    it('B4: BaseBranchFn sees pre-status raw contexts and returned string becomes baseBranch', async () => {
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
                { effectiveDiscoveryBranch: DISCOVERY },
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
                { effectiveDiscoveryBranch: DISCOVERY },
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
        expect(receivedDiscoveryBranches).toEqual([DISCOVERY, DISCOVERY, DISCOVERY]);
    });
});
