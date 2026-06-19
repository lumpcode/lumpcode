import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveE2eCliInvocation } from './resolveE2eCliInvocation';

describe('resolveE2eCliInvocation', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...originalEnv };
        vi.restoreAllMocks();
    });

    it('resolves SEA binary invocation by default', () => {
        const binary = path.join(os.tmpdir(), `lumpcode-e2e-sea-${process.pid}`);
        fs.writeFileSync(binary, '');
        process.env.LUMPCODE_E2E_BINARY = binary;
        delete process.env.LUMPCODE_E2E_RUNNER;
        delete process.env.LUMPCODE_E2E_CLI_ENTRY;

        expect(resolveE2eCliInvocation()).toEqual({
            runner: 'sea',
            executable: binary,
            argsPrefix: [],
        });

        fs.unlinkSync(binary);
    });

    it('resolves Node launcher invocation when LUMPCODE_E2E_RUNNER=node', () => {
        const entry = path.join(os.tmpdir(), `lumpcode-e2e-launcher-${process.pid}.js`);
        fs.writeFileSync(entry, '');
        process.env.LUMPCODE_E2E_RUNNER = 'node';
        process.env.LUMPCODE_E2E_CLI_ENTRY = entry;
        delete process.env.LUMPCODE_E2E_BINARY;

        expect(resolveE2eCliInvocation()).toEqual({
            runner: 'node',
            executable: process.execPath,
            argsPrefix: [entry],
        });

        fs.unlinkSync(entry);
    });
});
