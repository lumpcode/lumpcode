import { describe, it, expect } from 'vitest';
import { set } from './main';

describe('set', () => {
    it('should set a top-level property', () => {
        const obj = { a: 1, b: 2 };
        const result = set(obj, ['a'], 10);
        expect(result.a).toBe(10);
    });

    it('should return the same object reference', () => {
        const obj = { a: 1 };
        const result = set(obj, ['a'], 5);
        expect(result).toBe(obj);
    });

    it('should set a nested property', () => {
        const obj = { a: { b: { c: 1 } } };
        const result = set(obj, ['a', 'b', 'c'], 42);
        expect(result.a.b.c).toBe(42);
    });

    it('should create intermediate objects when they do not exist', () => {
        const obj = {} as { a: { b: { c: number } } };
        const result = set(obj, ['a', 'b', 'c'], 99);
        expect(result.a.b.c).toBe(99);
        expect(typeof result.a).toBe('object');
        expect(typeof result.a.b).toBe('object');
    });

    it('should set a value inside an array', () => {
        const obj = { items: ['x', 'y', 'z'] };
        const result = set(obj, ['items', 1], 'replaced');
        expect(result.items[1]).toBe('replaced');
    });

    it('should handle a single-key path', () => {
        const obj = { only: 'old' };
        const result = set(obj, ['only'], 'new');
        expect(result.only).toBe('new');
    });
});
