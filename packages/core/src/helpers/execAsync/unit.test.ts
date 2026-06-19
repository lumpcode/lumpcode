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

    it('should return a result with the stderr', async () => {
        const result = await execAsync('echo "Hello, world!"', { cwd: 'non-existent-directory' });
        expect(result.success).toBe(false);
        if (result.success) {
            expect(result.data.stderr).toContain('No such file or directory');
        }
    });
});