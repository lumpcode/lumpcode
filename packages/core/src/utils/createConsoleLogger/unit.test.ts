import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { createConsoleLogger } from './main';

describe('createConsoleLogger', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('always prints error messages', () => {
        const logger = createConsoleLogger({ json: true });
        logger.error('hard failure');
        expect(console.error).toHaveBeenCalledWith('hard failure');
    });

    it('suppresses info, warn, and verbose when json mode is on', () => {
        const logger = createConsoleLogger({ verbose: true, json: true });
        logger.info('info line');
        logger.warn('warn line');
        logger.verbose('verbose line');
        expect(console.log).not.toHaveBeenCalled();
        expect(console.warn).not.toHaveBeenCalled();
    });

    it('prints info and warn by default', () => {
        const logger = createConsoleLogger({});
        logger.info('info line');
        logger.warn('warn line');
        expect(console.log).toHaveBeenCalledWith('info line');
        expect(console.warn).toHaveBeenCalledWith('warn line');
    });

    it('gates verbose behind the verbose flag', () => {
        const quiet = createConsoleLogger({});
        quiet.verbose('hidden');
        expect(console.log).not.toHaveBeenCalled();

        const verbose = createConsoleLogger({ verbose: true });
        verbose.verbose('shown');
        expect(console.log).toHaveBeenCalledWith('shown');
    });

    it('applies prefix and child prefixes', () => {
        const logger = createConsoleLogger({ prefix: '[lumpcode]' });
        logger.child('[start]').info('tick');
        expect(console.log).toHaveBeenCalledWith('[lumpcode] [start] tick');
    });
});
