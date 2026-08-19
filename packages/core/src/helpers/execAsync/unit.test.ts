import { describe, it, expect } from 'vitest';
import { execAsync } from './main';

describe('execAsync', () => {
    it('should return a result with the stdout', async () => {
        const result = await execAsync('echo "Hello, world!"');
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.stdout).toContain('Hello, world!');
        }
    });

    it('returns an exit failure when the command fails without a timeout', async () => {
        const result = await execAsync('echo "Hello, world!"', { cwd: 'non-existent-directory' });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.reason).toBe('exit');
        expect(result.data.message).toMatch(/failed with error/i);
    });

    it('returns a timeout failure when the command exceeds timeoutMillis', async () => {
        const result = await execAsync('node -e "setTimeout(() => {}, 10000)"', { timeoutMillis: 50 });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.reason).toBe('timeout');
        expect(result.data.message).toMatch(/timed out after 50ms/);
    });
});