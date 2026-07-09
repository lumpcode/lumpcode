import type { CommandDescriptor } from '@lumpcode/core';

/** Run a shell script via `sh -c` (portable on Unix-like systems and Git Bash on Windows). */
export function shellCommand(script: string): CommandDescriptor {
    return {
        executable: 'sh',
        args: ['-c', script],
    };
}
