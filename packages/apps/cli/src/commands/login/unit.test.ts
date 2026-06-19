import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';

import { success, failure } from '@lumpcode/core';

import { command, type Output, type Injections } from './main';

const mocks = vi.hoisted(() => {
    let password = 'testpass123';
    let email = 'prompted@example.com';
    let stdinIsTTY = true;
    return {
        password: { get: () => password, set: (p: string) => { password = p; } },
        email: { get: () => email, set: (e: string) => { email = e; } },
        stdinIsTTY: { get: () => stdinIsTTY, set: (v: boolean) => { stdinIsTTY = v; } },
    };
});

vi.mock('node:readline/promises', () => ({
    createInterface: () => ({
        question: async () => mocks.email.get(),
        close: () => {},
    }),
}));

vi.mock('node:process', () => ({
    stdin: {
        setRawMode: vi.fn(),
        resume: vi.fn(),
        pause: vi.fn(),
        setEncoding: vi.fn(),
        get isTTY() {
            return mocks.stdinIsTTY.get();
        },
        on: vi.fn((_event: string, cb: (ch: string) => void) => {
            if (_event === 'data') {
                setTimeout(() => {
                    mocks.password.get().split('').forEach((ch: string) => cb(ch));
                    cb('\r');
                }, 0);
            }
        }),
        removeListener: vi.fn(),
    },
    stdout: {
        write: vi.fn(),
    },
}));

const TEST_AUTH_DIR = path.join(os.tmpdir(), '.lumpcode-test-login');
const TEST_AUTH_FILE_PATH = path.join(TEST_AUTH_DIR, 'auth.json');

const mockUser = { id: 'user-123', email: 'test@example.com' };
const mockToken = 'mock-token-abc123';

function mockLoginApiFn(response: 'success' | 'failure' | 'throw') {
    if (response === 'throw') {
        return vi.fn().mockRejectedValue(new Error('network error'));
    }
    if (response === 'failure') {
        return vi.fn().mockResolvedValue(failure({
            message: 'Invalid credentials',
        }));
    }
    return vi.fn().mockResolvedValue(success({
        token: mockToken,
        user: mockUser,
    }));
}

function makeInjections(overrides: Partial<Injections> = {}): Injections {
    return {
        loginApiFn: mockLoginApiFn('success'),
        isAuthenticatedFn: vi.fn().mockResolvedValue(false),
        authFilePath: TEST_AUTH_FILE_PATH,
        ...overrides,
    };
}

function makeInput(opts: { email?: string; password?: string } = {}) {
    return {
        options: { email: opts.email, password: opts.password },
        arguments: {},
    };
}

describe('login command', () => {
    beforeEach(() => {
        mocks.password.set('testpass123');
        mocks.email.set('prompted@example.com');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should login successfully when email is provided via --email', async () => {
        const loginApiFn = mockLoginApiFn('success');
        const injections = makeInjections({ loginApiFn });
        const handler = command.handlerMaker(injections);

        const result = await handler(makeInput({ email: 'test@example.com' }));

        expect(result.success).toBe(true);
        const { messages, data } = result.data as Output;
        expect(messages).toContain('Login successful!');
        expect(data.token).toBe(mockToken);
        expect(data.user.email).toBe('test@example.com');
        expect(loginApiFn).toHaveBeenCalledWith('test@example.com', 'testpass123');
    });

    it('should prompt for email when --email is not provided', async () => {
        mocks.password.set('testpass1234');
        mocks.email.set('interactive@example.com');
        const loginApiFn = mockLoginApiFn('success');
        const injections = makeInjections({ loginApiFn });
        const handler = command.handlerMaker(injections);

        const result = await handler(makeInput({}));

        expect(result.success).toBe(true);
        expect(loginApiFn).toHaveBeenCalledWith('interactive@example.com', 'testpass1234');
    });

    it('should login with --password and show warning', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const loginApiFn = mockLoginApiFn('success');
        const injections = makeInjections({ loginApiFn });
        const handler = command.handlerMaker(injections);

        const result = await handler(makeInput({ email: 'test@example.com', password: 'cli-provided-pass' }));

        expect(result.success).toBe(true);
        expect(loginApiFn).toHaveBeenCalledWith('test@example.com', 'cli-provided-pass');
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('not recommended'),
        );
        warnSpy.mockRestore();
    });

    it('should return failure when not in TTY and --password is not provided', async () => {
        mocks.stdinIsTTY.set(false);
        try {
            const loginApiFn = mockLoginApiFn('success');
            const injections = makeInjections({ loginApiFn });
            const handler = command.handlerMaker(injections);

            const result = await handler(makeInput({ email: 'test@example.com' }));

            expect(result.success).toBe(false);
            expect(result.data.messages[0]).toContain('interactive terminal');
            expect(result.data.messages[0]).toContain('--password');
            expect(loginApiFn).not.toHaveBeenCalled();
        } finally {
            mocks.stdinIsTTY.set(true);
        }
    });

    it('should return early when already authenticated', async () => {
        await fs.mkdir(TEST_AUTH_DIR, { recursive: true });
        await fs.writeFile(
            TEST_AUTH_FILE_PATH,
            JSON.stringify({ token: 'existing-token', user: mockUser }),
        );

        const loginApiFn = mockLoginApiFn('success');
        const isAuthenticatedFn = vi.fn().mockResolvedValue(true);
        const injections = makeInjections({ loginApiFn, isAuthenticatedFn });
        const handler = command.handlerMaker(injections);

        const result = await handler(makeInput({ email: 'test@example.com' }));

        expect(result.success).toBe(true);
        expect(result.data.messages[0]).toContain('Already logged in');
        expect(result.data.data.token).toBe('existing-token');
        expect(loginApiFn).not.toHaveBeenCalled();

        await fs.rm(TEST_AUTH_DIR, { recursive: true, force: true });
    });

    it('should proceed to login when existing token is invalid', async () => {
        await fs.mkdir(TEST_AUTH_DIR, { recursive: true });
        await fs.writeFile(
            TEST_AUTH_FILE_PATH,
            JSON.stringify({ token: 'expired-token', user: mockUser }),
        );

        const loginApiFn = mockLoginApiFn('success');
        const isAuthenticatedFn = vi.fn().mockResolvedValue(false);
        const injections = makeInjections({ loginApiFn, isAuthenticatedFn });
        const handler = command.handlerMaker(injections);

        const result = await handler(makeInput({ email: 'test@example.com' }));

        expect(result.success).toBe(true);
        expect(result.data.messages).toContain('Login successful!');
        expect(isAuthenticatedFn).toHaveBeenCalledWith('expired-token');
        expect(loginApiFn).toHaveBeenCalled();

        await fs.rm(TEST_AUTH_DIR, { recursive: true, force: true });
    });

    it('should return failure when login API fails', async () => {
        const loginApiFn = mockLoginApiFn('failure');
        const injections = makeInjections({ loginApiFn });
        const handler = command.handlerMaker(injections);

        const result = await handler(makeInput({ email: 'test@example.com' }));

        expect(result.success).toBe(false);
        expect(result.data.messages).toContain('Login failed');
    });

    it('should return failure when login API throws', async () => {
        const loginApiFn = mockLoginApiFn('throw');
        const injections = makeInjections({ loginApiFn });
        const handler = command.handlerMaker(injections);

        const result = await handler(makeInput({ email: 'test@example.com' }));

        expect(result.success).toBe(false);
        expect(result.data.messages).toContain('Login server error');
    });

    it('should save auth data on successful login', async () => {
        const loginApiFn = mockLoginApiFn('success');
        const injections = makeInjections({ loginApiFn });
        const handler = command.handlerMaker(injections);

        await handler(makeInput({ email: 'test@example.com' }));

        const saved = JSON.parse(await fs.readFile(TEST_AUTH_FILE_PATH, 'utf-8'));
        expect(saved.token).toBe(mockToken);
        expect(saved.user.email).toBe('test@example.com');

        await fs.rm(TEST_AUTH_DIR, { recursive: true, force: true });
    });

    it('should handle isAuthenticatedFn throwing', async () => {
        await fs.mkdir(TEST_AUTH_DIR, { recursive: true });
        await fs.writeFile(
            TEST_AUTH_FILE_PATH,
            JSON.stringify({ token: 'bad-token', user: mockUser }),
        );

        const loginApiFn = mockLoginApiFn('success');
        const isAuthenticatedFn = vi.fn().mockRejectedValue(new Error('network'));
        const injections = makeInjections({ loginApiFn, isAuthenticatedFn });
        const handler = command.handlerMaker(injections);

        const result = await handler(makeInput({ email: 'test@example.com' }));

        expect(result.success).toBe(true);
        expect(result.data.messages).toContain('Login successful!');
        expect(loginApiFn).toHaveBeenCalled();

        await fs.rm(TEST_AUTH_DIR, { recursive: true, force: true });
    });

    it('should auto-login on second call using the token saved by the first login', async () => {
        const loginApiFn = mockLoginApiFn('success');
        const isAuthenticatedFn = vi.fn().mockResolvedValue(true);
        const injections = makeInjections({ loginApiFn, isAuthenticatedFn });

        const firstHandler = command.handlerMaker(injections);
        const firstResult = await firstHandler(makeInput({ email: 'test@example.com' }));

        expect(firstResult.success).toBe(true);
        expect(firstResult.data.messages).toContain('Login successful!');
        expect(loginApiFn).toHaveBeenCalledTimes(1);

        const secondHandler = command.handlerMaker(injections);
        const secondResult = await secondHandler(makeInput({ email: 'test@example.com' }));

        expect(secondResult.success).toBe(true);
        expect(secondResult.data.messages[0]).toContain('Already logged in');
        expect(secondResult.data.data.token).toBe(mockToken);
        expect(secondResult.data.data.user.email).toBe('test@example.com');
        expect(loginApiFn).toHaveBeenCalledTimes(1);
        expect(isAuthenticatedFn).toHaveBeenCalledWith(mockToken);

        await fs.rm(TEST_AUTH_DIR, { recursive: true, force: true });
    });
});
