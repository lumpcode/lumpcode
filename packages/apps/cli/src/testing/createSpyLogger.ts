import type { Logger } from '@lumpcode/core';
import { vi, type Mock } from 'vitest';

export type SpyLogger = Logger & {
    warnings: string[];
    info: Mock<(message: string) => void>;
    warn: Mock<(message: string) => void>;
    error: Mock<(message: string) => void>;
    verbose: Mock<(message: string) => void>;
};

/** Vitest Logger double. `warn` records into `warnings` and remains a mock. `child` returns this same logger (prefix ignored), matching `noopLogger`. */
export function createSpyLogger(): SpyLogger {
    const warnings: string[] = [];
    const logger: SpyLogger = {
        warnings,
        info: vi.fn(),
        warn: vi.fn((message: string) => {
            warnings.push(message);
        }),
        error: vi.fn(),
        verbose: vi.fn(),
        child: () => logger,
    };
    return logger;
}
