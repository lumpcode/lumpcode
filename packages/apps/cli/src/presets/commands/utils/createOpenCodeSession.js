import { BOOTSTRAP_PROMPT } from './bootstrapPrompt.js';
import { execFileIgnoreStdin } from './execFileIgnoreStdin.js';
import { parseOpenCodeSessionId } from './parseOpenCodeSessionId.js';

export async function createOpenCodeSession({ model } = {}) {
    const args = ['run', '--format', 'json', '--title', 'lumpcode', '--auto', BOOTSTRAP_PROMPT];
    if (model != null && model !== '') {
        args.splice(1, 0, '-m', model);
    }

    try {
        const { stdout, stderr } = await execFileIgnoreStdin('opencode', args, {
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024,
        });
        const sessionId = parseOpenCodeSessionId(stdout) ?? parseOpenCodeSessionId(stderr);
        if (!sessionId) {
            throw new Error('Failed to create OpenCode session: no session id returned');
        }
        return sessionId;
    } catch (error) {
        if (error?.message?.startsWith('Failed to create OpenCode session:')) throw error;
        const sessionId = parseOpenCodeSessionId(error?.stdout) ?? parseOpenCodeSessionId(error?.stderr);
        if (sessionId) return sessionId;
        throw new Error(`Failed to create OpenCode session: ${error}`);
    }
}
