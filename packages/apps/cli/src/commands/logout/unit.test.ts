import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';

import { command, type Injections } from './main';

const TEST_AUTH_DIR = path.join(os.tmpdir(), '.lumpcode-test-logout');
const TEST_AUTH_FILE_PATH = path.join(TEST_AUTH_DIR, 'auth.json');

function makeInjections(overrides: Partial<Injections> = {}): Injections {
    return {
        authFilePath: TEST_AUTH_FILE_PATH,
        ...overrides,
    };
}

function makeInput() {
    return {
        options: {},
        arguments: {},
    };
}

describe('logout command', () => {
    afterEach(async () => {
        await fs.rm(TEST_AUTH_DIR, { recursive: true, force: true });
    });

    it('removes the auth file when it exists', async () => {
        await fs.mkdir(TEST_AUTH_DIR, { recursive: true });
        await fs.writeFile(
            TEST_AUTH_FILE_PATH,
            JSON.stringify({ token: 't', user: { id: '1', email: 'a@b.c' } }),
            { mode: 0o600 },
        );

        const handler = command.handlerMaker(makeInjections());
        const result = await handler(makeInput());

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.data?.removed).toBe(true);
            expect(result.data.messages.some((m) => m.includes('Logged out'))).toBe(true);
        }
        await expect(fs.access(TEST_AUTH_FILE_PATH)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('succeeds when there is no stored auth file', async () => {
        const handler = command.handlerMaker(makeInjections());
        const result = await handler(makeInput());

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.data?.removed).toBe(false);
            expect(result.data.messages.some((m) => m.includes('No stored authentication'))).toBe(true);
        }
    });
});
