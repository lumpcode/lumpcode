import { describe, it, expect, vi } from 'vitest';

import type { CommandFn, PromptFn, Steps } from '../../types';
import { collectStepsForContext } from './main';

const stubCommandFn: CommandFn = () => ({ executable: 'agent', args: ['-p'] });
const stubPromptFn: PromptFn = ({ context }) => `fix ${context.variables.FILE}`;

describe('collectStepsForContext', () => {
    it('collects steps from static step items', async () => {
        const stepsInput: Steps = [
            {
                promptFn: stubPromptFn,
                commandFn: stubCommandFn,
            },
        ];

        const steps = await collectStepsForContext({
            context: { name: 'ctx1', variables: { FILE: 'a.ts' } },
            contextList: [{ name: 'ctx1', variables: { FILE: 'a.ts' } }],
            currentContextIndex: 0,
            lumpVariables: {},
            steps: stepsInput,
            setupFn: async () => ({ contextRunState: {} }),
            projectRoot: '/tmp',
            workspacePath: '/tmp',
        });

        expect(steps).toHaveLength(1);
        expect(steps[0].prompt).toBe('fix a.ts');
        expect(steps[0].command).toEqual({ executable: 'agent', args: ['-p'] });
    });

    it('expands recursive steps functions', async () => {
        const recursiveFn = vi.fn(async () => [
            {
                promptFn: stubPromptFn,
                commandFn: stubCommandFn,
            },
        ]);

        const stepsInput: Steps = [recursiveFn];

        const steps = await collectStepsForContext({
            context: { name: 'ctx1', variables: { FILE: 'b.ts' } },
            contextList: [{ name: 'ctx1', variables: { FILE: 'b.ts' } }],
            currentContextIndex: 0,
            lumpVariables: {},
            steps: stepsInput,
            setupFn: async () => ({ contextRunState: { key: 1 } }),
            projectRoot: '/tmp',
            workspacePath: '/tmp',
        });

        expect(recursiveFn).toHaveBeenCalledOnce();
        expect(steps).toHaveLength(1);
        expect(steps[0].prompt).toBe('fix b.ts');
    });

    it('collects prompt-less steps with empty prompt omitted', async () => {
        const steps = await collectStepsForContext({
            context: { name: 'ctx1', variables: {} },
            contextList: [{ name: 'ctx1', variables: {} }],
            currentContextIndex: 0,
            lumpVariables: {},
            steps: [{
                commandFn: () => ({ executable: 'echo', args: ['ok'] }),
            }],
            setupFn: async () => ({ contextRunState: {} }),
            projectRoot: '/tmp',
            workspacePath: '/tmp',
        });

        expect(steps).toHaveLength(1);
        expect(steps[0].prompt).toBeUndefined();
        expect(steps[0].command).toEqual({ executable: 'echo', args: ['ok'] });
    });

    it('collects env overrides when commandFn returns them', async () => {
        const steps = await collectStepsForContext({
            context: { name: 'ctx1', variables: {} },
            contextList: [{ name: 'ctx1', variables: {} }],
            currentContextIndex: 0,
            lumpVariables: {},
            steps: [{
                commandFn: () => ({
                    executable: 'npm',
                    args: ['run', 'build'],
                    env: { NODE_ENV: 'development' },
                }),
            }],
            setupFn: async () => ({ contextRunState: {} }),
            projectRoot: '/tmp',
            workspacePath: '/tmp',
        });

        expect(steps).toHaveLength(1);
        expect(steps[0].command).toEqual({
            executable: 'npm',
            args: ['run', 'build'],
            env: { NODE_ENV: 'development' },
        });
    });

    it('collects null command when commandFn returns null', async () => {
        const steps = await collectStepsForContext({
            context: { name: 'ctx1', variables: {} },
            contextList: [{ name: 'ctx1', variables: {} }],
            currentContextIndex: 0,
            lumpVariables: {},
            steps: [{
                commandFn: () => null,
            }],
            setupFn: async () => ({ contextRunState: {} }),
            projectRoot: '/tmp',
            workspacePath: '/tmp',
        });

        expect(steps).toHaveLength(1);
        expect(steps[0].command).toBeNull();
    });
});
