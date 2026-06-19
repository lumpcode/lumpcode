import z from "zod";

export const contextStatus = ['toDo', 'branchPushed', 'finished'] as const;

export const contextStatusSchema = z.enum(contextStatus);

export type ContextStatus = z.infer<typeof contextStatusSchema>;