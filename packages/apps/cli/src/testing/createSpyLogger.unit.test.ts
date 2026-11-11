import type { Logger } from '@lumpcode/core';
import { describe, expect, it } from 'vitest';

import { createSpyLogger } from './createSpyLogger';

describe('createSpyLogger', () => {
    it('records every warn message and stays a vitest mock', () => {
        const logger = createSpyLogger();

        logger.warn('first');
        logger.warn('second');

        expect(logger.warnings).toEqual(['first', 'second']);
        expect(logger.warn).toHaveBeenCalledTimes(2);
        expect(logger.warn).toHaveBeenCalledWith('first');
        expect(logger.warn).toHaveBeenCalledWith('second');
    });

    it('leaves info, error, and verbose as mocks that do not fill warnings', () => {
        const logger = createSpyLogger();

        logger.info('info');
        logger.error('error');
        logger.verbose('verbose');

        expect(logger.warnings).toEqual([]);
        expect(logger.info).toHaveBeenCalledWith('info');
        expect(logger.error).toHaveBeenCalledWith('error');
        expect(logger.verbose).toHaveBeenCalledWith('verbose');
    });

    it('returns this logger from child and shares warnings', () => {
        const logger = createSpyLogger();
        const child = logger.child('ignored-prefix');

        expect(child).toBe(logger);
        child.warn('from child');
        expect(logger.warnings).toEqual(['from child']);
        expect(logger.warn).toHaveBeenCalledWith('from child');
    });

    it('is assignable to Logger', () => {
        const logger = createSpyLogger();
        const asLogger: Logger = logger;

        asLogger.info('still a spy');
        expect(logger.info).toHaveBeenCalledWith('still a spy');
    });
});
