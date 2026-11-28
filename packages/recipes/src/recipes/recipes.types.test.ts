import { describe, expectTypeOf, it } from 'vitest';

import type { FilePath, LumpJsConfig } from '@lumpcode/cli-utils';
import type { Context, LumpVariables, WorkflowFn } from '@lumpcode/core';

import {
    abstractionBacklog,
    abstractionBacklogSteps,
    abstractionFinder,
    abstractionFinderSteps,
    backlog,
    backlogSteps,
    featureBacklog,
    featureBacklogSteps,
    type FeatureBacklogPromptInput,
} from './index';

// Skipped until the impl stage. The assertions are still typechecked. Unskip; do not rewrite.
describe('workflow recipe types', () => {
    it('workflow recipes take workflow options and steps recipes keep today\'s options', () => {
        const configUrl = import.meta.url;

        function unused() {
            // @ts-expect-error workflow featureBacklog does not accept promptFns
            featureBacklog({ configUrl, promptFns: {} });
            // @ts-expect-error steps featureBacklog does not accept prompts
            featureBacklogSteps({ configUrl, prompts: { impl: 'x' } });

            backlog({
                configUrl,
                stages: {
                    // @ts-expect-error workflow backlog stages do not accept steps
                    ship: { completion: 'keepPending', steps: [] },
                },
                resolveItem: () => ({ stage: 'ship' }),
            });
            backlogSteps({
                configUrl,
                stages: {
                    // @ts-expect-error steps backlog stages do not accept workflow
                    ship: { completion: 'keepPending', workflow: async () => undefined },
                },
                resolveItem: () => ({ stage: 'ship' }),
            });

            // @ts-expect-error workflow abstractionFinder does not accept steps
            abstractionFinder({ configUrl, backlogItemsDir: 'items', steps: [] });
            // @ts-expect-error steps abstractionFinder does not accept a workflow override
            abstractionFinderSteps({ configUrl, backlogItemsDir: 'items', workflow: async () => undefined });

            // @ts-expect-error workflow abstractionBacklog does not accept implSteps
            abstractionBacklog({ configUrl, implSteps: [] });
            // @ts-expect-error steps abstractionBacklog does not accept a workflow override
            abstractionBacklogSteps({ configUrl, workflow: async () => undefined });

            expectTypeOf(featureBacklog({
                configUrl,
                maxAttempts: 2,
                implValidateCommand: { executable: 'npm', args: ['test'] },
                prompts: {
                    impl: ({ context, lumpVariables }) => {
                        expectTypeOf(context).toEqualTypeOf<Context>();
                        expectTypeOf(lumpVariables).toEqualTypeOf<LumpVariables>();
                        return 'implement';
                    },
                },
            }).workflow).toEqualTypeOf<FilePath | WorkflowFn | undefined>();

            expectTypeOf(featureBacklogSteps({
                configUrl,
                promptFns: { impl: () => 'implement' },
            }).steps).toEqualTypeOf<LumpJsConfig['steps']>();

            const promptInput = null as unknown as FeatureBacklogPromptInput;
            expectTypeOf(promptInput).toEqualTypeOf<{ context: Context; lumpVariables: LumpVariables }>();
        }

        void unused;
    });
});
