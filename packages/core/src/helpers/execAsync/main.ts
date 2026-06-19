import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { failure, success } from '../../utils';

const execAsyncBase = promisify(exec);

export async function execAsync(command: string, options?: { cwd?: string }) {
    const { stdout, stderr, hasErrored } = await execAsyncBase(command, { cwd: options?.cwd })
    .then(result => ({
        stdout: result.stdout,
        stderr: result.stderr,
        hasErrored: false,
    }))
    .catch(e => ({
        stderr: e,
        stdout: e,
        hasErrored: true,
    }));

    if (hasErrored) {
        return failure({
            message: `Command ${command} failed with error: ${stderr}`,
            info: {
                command,
                stdout,
                stderr,
            },
        })
    }
    
    return success({
        stdout,
        stderr,
    });
}