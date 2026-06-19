import type { Logger } from '../../types/Logger';

export const noopLogger: Logger = {
    error: () => {},
    warn: () => {},
    info: () => {},
    verbose: () => {},
    child: () => noopLogger,
};
