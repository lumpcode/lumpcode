import type { Logger } from '@lumpcode/core';

export const noopLogger: Logger = {
    error: () => {},
    warn: () => {},
    info: () => {},
    verbose: () => {},
    child: () => noopLogger,
};
