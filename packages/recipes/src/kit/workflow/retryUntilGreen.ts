import type { AgentSession, CommandDescriptor, Shell, ShellResult } from '@lumpcode/core';

export interface RetryUntilGreenInput {
    session: AgentSession;
    shell: Shell;
    check: string | CommandDescriptor;
    /** First prompt. Omit when the work already happened. */
    prompt?: string;
    /** Fix attempts after the first check. Default 3. */
    maxAttempts?: number;
    fixPrompt?: (failed: ShellResult, attempt: number) => string;
}

/** Check, then prompt a fix, until the check is green or the fix attempts are spent. */
export async function retryUntilGreen(
    input: RetryUntilGreenInput,
): Promise<{ succeeded: boolean; attempts: number; lastCheck: ShellResult }> {
    void input;
    throw new Error('not implemented');
}
