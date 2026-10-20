import * as z from 'zod';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { ignoredJsonSchemaKey } from './main';

const innerSchema = z
    .object({
        name: z.string(),
        count: z.number().optional(),
    })
    .strict();

const wrappedSchema = ignoredJsonSchemaKey(innerSchema);

describe('ignoredJsonSchemaKey', () => {
    it('accepts and strips optional $schema', () => {
        const withoutKey = wrappedSchema.safeParse({ name: 'demo' });
        expect(withoutKey.success).toBe(true);
        if (!withoutKey.success) throw new Error('unreachable');
        expect(withoutKey.data).toEqual({ name: 'demo' });
        expect(withoutKey.data).not.toHaveProperty('$schema');

        const withKey = wrappedSchema.safeParse({
            name: 'demo',
            count: 2,
            $schema: 'https://lumpcode.com/schemas/example.schema.json',
        });
        expect(withKey.success).toBe(true);
        if (!withKey.success) throw new Error('unreachable');
        expect(withKey.data).toEqual({ name: 'demo', count: 2 });
        expect(withKey.data).not.toHaveProperty('$schema');
        expect(withKey.data).toEqual(innerSchema.parse({ name: 'demo', count: 2 }));
    });

    it('rejects unknown keys other than $schema', () => {
        const result = wrappedSchema.safeParse({ name: 'demo', extra: true });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.error.issues.some((issue) => issue.code === 'unrecognized_keys')).toBe(true);
    });

    it('rejects a non-string $schema', () => {
        const result = wrappedSchema.safeParse({ name: 'demo', $schema: 1 });
        expect(result.success).toBe(false);
    });

    it('infers the inner schema type with no $schema field', () => {
        type Inner = z.infer<typeof innerSchema>;
        type Wrapped = z.infer<typeof wrappedSchema>;
        expectTypeOf<Wrapped>().toEqualTypeOf<Inner>();
        expectTypeOf<Wrapped>().not.toHaveProperty('$schema');
    });
});
