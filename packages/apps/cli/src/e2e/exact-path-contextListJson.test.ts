import { describe, expect, it } from 'vitest';

import { expectCliOk, runE2eCli, useE2eProjects } from './harness';

/**
 * Optional thin e2e for lumpcode-setup exact-path `contextListJson`.
 * Skipped until `makeGetContextListFnFromTemplate` emits exact-path contexts.
 */
describe.skip('E2E exact-path contextListJson (lumpcode-setup)', () => {
    const { createProject } = useE2eProjects();

    it('JSON exact-path README.md is visible to lump-plan --contexts', async () => {
        const lumpName = 'exactPathReadme';
        const project = await createProject({
            projectName: 'e2e-exact-path',
            lumps: [
                {
                    name: lumpName,
                    configJson: {
                        contextListJson: { FILE: 'README.md' },
                        prompt: {
                            promptTemplate: 'clean and improve the code in @{FILE}',
                            command: 'e2e-agent',
                        },
                        numberOfContextsPerBranch: 1,
                    },
                    useE2eAgent: true,
                },
            ],
        });

        const plan = await runE2eCli({
            project,
            args: ['lump-plan', lumpName, '--contexts', '--json'],
        });
        expectCliOk(plan, 'lump-plan --contexts');

        const contexts = plan.json.data?.contexts as
            | Array<{ name: string; variables: Record<string, string> }>
            | undefined;
        expect(contexts).toEqual([
            { name: 'README', variables: { FILE: 'README.md' } },
        ]);
    });
});
