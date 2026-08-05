import { describe, expect, it } from 'vitest';

import type { LumpJsConfig } from '../../types/LumpJsConfig';
import type { ResolvedProjectLocalConfig } from '../../types/ResolvedProjectLocalConfig';
import { applyLumpConfigDefaults } from './main';

/**
 * clean-local-project-json-config D* — skipped until applyLumpConfigDefaults lands.
 */
describe.skip('applyLumpConfigDefaults (clean-local-project-json-config)', () => {
    const baseResolved: ResolvedProjectLocalConfig = {
        projectName: 'demo',
        mode: 'shared',
        workspaceStrategy: 'checkout',
        primaryBranch: 'main',
        command: 'cursor',
        maximumNumberOfConcurrentBranches: 2,
        keepHistory: true,
        verbose: true,
    };

    function apply(jsConfig: LumpJsConfig, resolved: ResolvedProjectLocalConfig = baseResolved) {
        return applyLumpConfigDefaults({ jsConfig, resolved });
    }

    it('D1: all undefined on lump filled from resolved', () => {
        const result = apply({});
        expect(result.command).toBe('cursor');
        expect(result.maximumNumberOfConcurrentBranches).toBe(2);
        expect(result.keepHistory).toBe(true);
        expect(result.verbose).toBe(true);
    });

    it('D2: lump command wins', () => {
        const result = apply({ command: 'copilot' });
        expect(result.command).toBe('copilot');
    });

    it('D3: lump keepHistory false not overridden', () => {
        const result = apply({ keepHistory: false });
        expect(result.keepHistory).toBe(false);
    });

    it('D4: lump cap 0 not overridden', () => {
        const result = apply({ maximumNumberOfConcurrentBranches: 0 });
        expect(result.maximumNumberOfConcurrentBranches).toBe(0);
    });

    it('D5: lump verbose false not overridden', () => {
        const result = apply({ verbose: false });
        expect(result.verbose).toBe(false);
    });

    it('D6: explicit undefined inherits', () => {
        const jsConfig: LumpJsConfig = { command: undefined };
        const result = apply(jsConfig);
        expect(result.command).toBe('cursor');
    });

    it('D7: uses resolved value (local already won); no re-read', () => {
        const resolved: ResolvedProjectLocalConfig = {
            ...baseResolved,
            command: 'copilot',
        };
        const result = apply({}, resolved);
        expect(result.command).toBe('copilot');
    });

    it('D8: does not touch other lump keys', () => {
        const result = apply({
            baseBranch: 'feature/x',
            numberOfContextsPerBranch: 3,
        } as LumpJsConfig);
        expect(result.baseBranch).toBe('feature/x');
        expect(result.numberOfContextsPerBranch).toBe(3);
        expect(result.command).toBe('cursor');
    });

    it('D9: no project verbose backdoor when resolved omits verbose', () => {
        const resolved: ResolvedProjectLocalConfig = {
            projectName: 'demo',
            mode: 'shared',
            workspaceStrategy: 'checkout',
            primaryBranch: 'main',
            command: 'cursor',
        };
        const result = apply({}, resolved);
        expect(result.verbose).toBeUndefined();
    });

    it('D10: pure — same inputs twice; does not mutate input jsConfig', () => {
        const jsConfig: LumpJsConfig = { baseBranch: 'main' };
        const first = apply(jsConfig);
        const second = apply(jsConfig);
        expect(first).toEqual(second);
        expect(jsConfig.command).toBeUndefined();
        expect(jsConfig.keepHistory).toBeUndefined();
        expect(jsConfig.verbose).toBeUndefined();
        expect(jsConfig.maximumNumberOfConcurrentBranches).toBeUndefined();
        expect(jsConfig.baseBranch).toBe('main');
    });
});
