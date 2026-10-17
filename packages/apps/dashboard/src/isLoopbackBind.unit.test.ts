import { describe, expect, it } from 'vitest';

import { isLoopbackBind } from './isLoopbackBind';

describe('isLoopbackBind', () => {
    it('treats loopback addresses as exempt', () => {
        expect(isLoopbackBind('127.0.0.1')).toBe(true);
        expect(isLoopbackBind('::1')).toBe(true);
        expect(isLoopbackBind('[::1]')).toBe(true);
        expect(isLoopbackBind('localhost')).toBe(true);
        expect(isLoopbackBind('LOCALHOST')).toBe(true);
    });

    it('warns for any other bind', () => {
        expect(isLoopbackBind('0.0.0.0')).toBe(false);
        expect(isLoopbackBind('192.168.1.10')).toBe(false);
    });
});
