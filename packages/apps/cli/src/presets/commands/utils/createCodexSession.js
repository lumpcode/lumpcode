import { BOOTSTRAP_PROMPT } from './bootstrapPrompt.js';
import { execFileIgnoreStdin } from './execFileIgnoreStdin.js';
import { parseCodexThreadId } from './parseCodexThreadId.js';

export async function createCodexSession({ model } = {}) {
    const args = [
        'exec',
        '--json',
        '--sandbox',
        'workspace-write',
    ];
    if (model != null && model !== '') {
        args.push('--model', model);
    }
    args.push(BOOTSTRAP_PROMPT);

    try {
        const { stdout, stderr } = await execFileIgnoreStdin('codex', args, {
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024,
        });
        const threadId = parseCodexThreadId(stdout) ?? parseCodexThreadId(stderr);
        if (!threadId) {
            throw new Error('Failed to create Codex session: no thread_id returned');
        }
        return threadId;
    } catch (error) {
        if (error?.message?.startsWith('Failed to create Codex session:')) throw error;
        const threadId = parseCodexThreadId(error?.stdout) ?? parseCodexThreadId(error?.stderr);
        if (threadId) return threadId;
        throw new Error(`Failed to create Codex session: ${error}`);
    }
}
