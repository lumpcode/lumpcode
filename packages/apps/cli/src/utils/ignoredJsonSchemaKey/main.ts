import * as z from 'zod';

/**
 * Accept optional `$schema` (editor metadata) on a `.strict()` object schema,
 * strip it from parse output, and keep rejecting any other unknown key.
 */
export function ignoredJsonSchemaKey<S extends z.ZodObject<z.ZodRawShape>>(
    schema: S,
): z.ZodType<z.infer<S>> {
    return schema
        .extend({
            $schema: z.string().optional(),
        })
        .strict()
        .transform((value): z.infer<S> => {
            const { $schema: _ignored, ...rest } = value;
            return rest as z.infer<S>;
        });
}
