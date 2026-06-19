import * as z from 'zod';

export type CommandInputSchema = z.ZodObject<{
    options: z.ZodObject<any>;
    arguments: z.ZodObject<any>;
}>