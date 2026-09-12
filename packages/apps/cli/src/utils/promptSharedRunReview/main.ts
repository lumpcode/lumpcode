import { success, type Success } from '@lumpcode/core';

export type SharedRunReviewChoice = 'commit' | 'exit';

const PORCELAIN_HEADER = 'These changes will be committed if you choose c:';
const MENU_VERIFY = 'Verify the updates.';
const MENU_COMMIT = '  [c] Commit with the LUMP marker (does not push)';
const MENU_EXIT = '  [e] Exit without committing — edit the lump and run again';

function writeLine(stdout: NodeJS.WriteStream, line: string): void {
    stdout.write(`${line}\n`);
}

function writeMenu(stdout: NodeJS.WriteStream): void {
    writeLine(stdout, MENU_VERIFY);
    writeLine(stdout, MENU_COMMIT);
    writeLine(stdout, MENU_EXIT);
}

function writeReviewPrompt(stdout: NodeJS.WriteStream, porcelainLines: string[]): void {
    writeLine(stdout, PORCELAIN_HEADER);
    for (const line of porcelainLines) {
        writeLine(stdout, line);
    }
    writeLine(stdout, '');
    writeMenu(stdout);
}

function keyFromChunk(chunk: string | Buffer): string {
    return String(chunk).replace(/\r|\n/g, '');
}

/**
 * TTY commit / exit after a shared walk. Always Success.
 * `--json` or `!stdin.isTTY` → `exit` without reading stdin. Ctrl+C / EOF → `exit`.
 */
export async function promptSharedRunReview(input: {
    stdin: NodeJS.ReadStream;
    stdout: NodeJS.WriteStream;
    json: boolean;
    porcelainLines: string[];
}): Promise<Success<SharedRunReviewChoice>> {
    const { stdin, stdout, json, porcelainLines } = input;
    if (json || !stdin.isTTY) {
        return success('exit');
    }

    writeReviewPrompt(stdout, porcelainLines);

    return new Promise((resolve) => {
        const rawMode = typeof stdin.setRawMode === 'function' && stdin.isTTY;

        const finish = (choice: SharedRunReviewChoice) => {
            stdin.removeListener('data', onData);
            stdin.removeListener('end', onEnd);
            if (rawMode) {
                stdin.setRawMode(false);
            }
            stdin.pause();
            resolve(success(choice));
        };

        const onData = (chunk: string | Buffer) => {
            const key = keyFromChunk(chunk);
            if (key === '\x03') {
                finish('exit');
                return;
            }
            if (key === 'c' || key === 'C') {
                finish('commit');
                return;
            }
            if (key === 'e' || key === 'E') {
                finish('exit');
                return;
            }
            writeMenu(stdout);
        };

        const onEnd = () => {
            finish('exit');
        };

        if (rawMode) {
            stdin.setRawMode(true);
        }
        stdin.setEncoding('utf8');
        stdin.resume();
        stdin.on('data', onData);
        stdin.on('end', onEnd);
    });
}
