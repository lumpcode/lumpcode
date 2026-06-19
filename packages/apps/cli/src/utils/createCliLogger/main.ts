import { createConsoleLogger, type Logger } from '@lumpcode/core';

export function createCliLogger(input: {
    verbose?: boolean;
    json?: boolean;
    prefix?: string;
}): Logger {
    return createConsoleLogger({
        verbose: !!input.verbose,
        json: !!input.json,
        prefix: input.prefix ?? '[lumpcode]',
    });
}
