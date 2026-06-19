import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cliLog } from './main';

describe('cliLog', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('prints each message on its own line', () => {
        cliLog({ messages: ['first', 'second'] });

        expect(logSpy).toHaveBeenCalledTimes(2);
        expect(logSpy).toHaveBeenNthCalledWith(1, 'first');
        expect(logSpy).toHaveBeenNthCalledWith(2, 'second');
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('prints messages to stderr when error is true', () => {
        cliLog({ messages: ['oops'] }, false, true);

        expect(errorSpy).toHaveBeenCalledWith('oops');
        expect(logSpy).not.toHaveBeenCalled();
    });

    it('prints one-line JSON when outputFullJson is true', () => {
        const payload = { messages: ['done'], data: { ok: true } };
        cliLog(payload, true);

        expect(logSpy).toHaveBeenCalledWith(JSON.stringify(payload));
        expect(logSpy).toHaveBeenCalledTimes(1);
    });

    it('prints one-line JSON to stderr when outputFullJson and error are true', () => {
        const payload = { messages: ['fail'], data: { code: 1 } };
        cliLog(payload, true, true);

        expect(errorSpy).toHaveBeenCalledWith(JSON.stringify(payload));
        expect(logSpy).not.toHaveBeenCalled();
    });
});
