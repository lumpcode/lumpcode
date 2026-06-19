export type ExecFailureData = {
    message: string;
    info?: {
        command?: string;
        stdout?: unknown;
        stderr?: unknown;
    };
    code?: number;
    stderr?: unknown;
    stdout?: unknown;
};
