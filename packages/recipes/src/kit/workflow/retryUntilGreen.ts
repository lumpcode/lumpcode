import type { AgentSession, CommandDescriptor, Shell, ShellResult } from '@lumpcode/core';

import { defaultFixPromptText, formatCheckCommand } from '../defaultFixPrompt';

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
    const {
        session,
        shell,
        check,
        prompt,
        maxAttempts = 3,
        fixPrompt,
    } = input;
    const commandText = formatCheckCommand(check);
    const checkLabel = `retry: ${commandText}`;

    if (prompt !== undefined) {
        await session.prompt(prompt);
    }

    let lastCheck: ShellResult;
    for (let attempts = 1; ; attempts += 1) {
        lastCheck = await shell(check, { label: checkLabel });
        if (lastCheck.succeeded || attempts > maxAttempts) {
            return { succeeded: lastCheck.succeeded, attempts, lastCheck };
        }
        const fixText = fixPrompt
            ? fixPrompt(lastCheck, attempts)
            : defaultFixPromptText(commandText, lastCheck.output);
        await session.prompt(fixText, { label: `retry fix ${attempts}/${maxAttempts}` });
    }
}
