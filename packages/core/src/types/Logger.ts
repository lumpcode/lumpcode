export type Logger = {
    error: (message: string) => void;
    warn: (message: string) => void;
    info: (message: string) => void;
    verbose: (message: string) => void;
    child: (prefix: string) => Logger;
};
