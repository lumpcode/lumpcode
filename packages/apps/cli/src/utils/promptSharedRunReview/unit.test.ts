import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';

import { promptSharedRunReview } from './main';

const MENU = '  [c] Commit with the LUMP marker (does not push)';

function fakeStdio(isTTY: boolean): {
    stdin: NodeJS.ReadStream;
    stdout: NodeJS.WriteStream;
    read: () => string;
} {
    const stdin = new PassThrough() as PassThrough & { isTTY: boolean };
    stdin.isTTY = isTTY;
    let buf = '';
    const stdout = new PassThrough();
    stdout.on('data', (chunk) => {
        buf += String(chunk);
    });
    return {
        stdin: stdin as unknown as NodeJS.ReadStream,
        stdout: stdout as unknown as NodeJS.WriteStream,
        read: () => buf,
    };
}

async function choose(
    isTTY: boolean,
    json: boolean,
    keys: string[],
    porcelainLines: string[] = [' M foo.ts'],
) {
    const io = fakeStdio(isTTY);
    const pending = promptSharedRunReview({ ...io, json, porcelainLines });
    for (const key of keys) {
        await Promise.resolve();
        io.stdin.emit('data', key);
    }
    return { result: await pending, read: io.read };
}

describe('promptSharedRunReview (shared-run-review)', () => {
    it('prints porcelain and returns commit for c / C', async () => {
        for (const key of ['c', 'C']) {
            const { result, read } = await choose(true, false, [key], [' M foo.ts', '?? bar.ts']);
            expect(result).toEqual({ success: true, data: 'commit' });
            expect(read()).toContain('These changes will be committed if you choose c:');
            expect(read()).toContain(' M foo.ts');
            expect(read()).toContain(MENU);
            expect(read()).toContain('  [e] Exit without committing — edit the lump and run again');
        }
    });

    it('returns exit for e / E', async () => {
        for (const key of ['e', 'E']) {
            const { result } = await choose(true, false, [key], []);
            expect(result).toEqual({ success: true, data: 'exit' });
        }
    });

    it('re-prints the menu on other keys then accepts c', async () => {
        const { result, read } = await choose(true, false, ['x', 'c']);
        expect(result).toEqual({ success: true, data: 'commit' });
        expect(read().split(MENU).length - 1).toBeGreaterThanOrEqual(2);
    });

    it('returns exit on Ctrl+C and on EOF', async () => {
        const ctrlC = await choose(true, false, ['\x03']);
        expect(ctrlC.result).toEqual({ success: true, data: 'exit' });

        const io = fakeStdio(true);
        const pending = promptSharedRunReview({
            stdin: io.stdin,
            stdout: io.stdout,
            json: false,
            porcelainLines: [' M foo.ts'],
        });
        await Promise.resolve();
        io.stdin.emit('end');
        expect(await pending).toEqual({ success: true, data: 'exit' });
    });

    it('returns exit without reading stdin or dumping porcelain for --json and non-TTY', async () => {
        for (const input of [
            { isTTY: true, json: true },
            { isTTY: false, json: false },
        ]) {
            const io = fakeStdio(input.isTTY);
            io.stdin.on('data', () => {
                throw new Error('must not read stdin');
            });
            const result = await Promise.race([
                promptSharedRunReview({ ...io, json: input.json, porcelainLines: [' M dirty.ts'] }),
                new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error('prompt hung')), 200);
                }),
            ]);
            expect(result).toEqual({ success: true, data: 'exit' });
            expect(io.read()).not.toContain('[c]');
        }
    });
});
