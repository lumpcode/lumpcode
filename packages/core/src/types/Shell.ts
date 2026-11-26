import type { CommandDescriptor } from './CommandFn';

export interface ShellOptions {
    /** Default: workspacePath. */
    cwd?: string;
    /** Merged over process.env. */
    env?: Record<string, string>;
    /** This call only. Omitted: the rest of the workflow's time. */
    timeoutMillis?: number;
    /** Default: the command text. */
    label?: string;
}

export interface ShellResult {
    /** stdout and stderr together. */
    output: string;
    /** Exit 0 and not timed out. */
    succeeded: boolean;
    /** Null on timeout or signal. */
    exitCode: number | null;
    timedOut: boolean;
}

export interface Shell {
    (command: string | CommandDescriptor, options?: ShellOptions): Promise<ShellResult>;
}
