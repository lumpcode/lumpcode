import * as z from 'zod';

export const baseCommandOptionsSchema = z.object({
    json: z.boolean().optional().describe('Output the result as JSON'),
    verbose: z.boolean().optional().describe('Enable verbose operational logging during run and start'),
});
