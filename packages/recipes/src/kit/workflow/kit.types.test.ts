import { describe, expectTypeOf, it } from 'vitest';

import type { LumpJsConfigSteps } from '@lumpcode/cli-utils';
import type { AgentSession, Shell, ShellResult } from '@lumpcode/core';

import {
    mustSucceed,
    requireArtifact,
    retryUntilGreen,
    retryUntilGreenSteps,
    type RetryUntilGreenInput,
} from '../index';

// Skipped until the impl stage. The assertions are still typechecked. Unskip; do not rewrite.
describe.skip('kit workflow types', () => {
    it('retryUntilGreen takes session, shell, and check; the steps input is a type error', () => {
        const session = null as unknown as AgentSession;
        const shell = null as unknown as Shell;

        function unused() {
            // @ts-expect-error workflow retryUntilGreen does not accept the steps input
            retryUntilGreen({ steps: [], validationCommandFn: () => ({ executable: 'true', args: [] }) });

            expectTypeOf(retryUntilGreen({
                session,
                shell,
                check: 'npm run test',
            })).toEqualTypeOf<Promise<{ succeeded: boolean; attempts: number; lastCheck: ShellResult }>>();

            expectTypeOf(retryUntilGreen({
                session,
                shell,
                check: { executable: 'npm', args: ['test'] },
                prompt: 'go',
                maxAttempts: 2,
                fixPrompt: (failed, attempt) => {
                    expectTypeOf(failed).toEqualTypeOf<ShellResult>();
                    expectTypeOf(attempt).toEqualTypeOf<number>();
                    return 'fix';
                },
            })).toEqualTypeOf<Promise<{ succeeded: boolean; attempts: number; lastCheck: ShellResult }>>();

            expectTypeOf(retryUntilGreenSteps({
                steps: [],
                validationCommandFn: () => ({ executable: 'true', args: [] }),
            })).toEqualTypeOf<LumpJsConfigSteps>();

            const shellResult = null as unknown as ShellResult;
            expectTypeOf(mustSucceed(shellResult, 'lint failed')).toEqualTypeOf<ShellResult>();

            expectTypeOf(requireArtifact({
                session,
                workspacePath: '/tmp/ws',
                path: 'notes/out.md',
            })).toEqualTypeOf<Promise<{ succeeded: boolean; path: string }>>();

            const input = null as unknown as RetryUntilGreenInput;
            expectTypeOf(input.check).toEqualTypeOf<RetryUntilGreenInput['check']>();
        }

        void unused;
    });
});
