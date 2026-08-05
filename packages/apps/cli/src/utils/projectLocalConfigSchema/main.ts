import * as z from 'zod';

import { isCommandFileRef } from '../lumpConfigPathRef';

const VALID_PROJECT_NAME = /^[a-zA-Z0-9_-]+$/;

function isValidProjectName(name: string): boolean {
    return VALID_PROJECT_NAME.test(name);
}

export const primaryBranchesSchema = z
    .array(z.string().min(1))
    .min(1, 'primaryBranches must not be empty')
    .superRefine((branches, ctx) => {
        const seen = new Set<string>();
        for (const branch of branches) {
            if (seen.has(branch)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'duplicate primary branch names are not allowed',
                });
                return;
            }
            seen.add(branch);
        }
    });

const tagCommandSchema = z
    .string()
    .min(1)
    .superRefine((value, ctx) => {
        if (isCommandFileRef(value)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                    'command must be a registered tag (not a .ts/.js file path); file-path commands are only allowed in lump config',
            });
        }
    });

const sharedPrimaryFields = {
    primaryBranch: z.string().min(1, 'primaryBranch must be a non-empty string').optional(),
    projectBaseBranch: z.string().min(1, 'projectBaseBranch must be a non-empty string').optional(),
    primaryBranches: primaryBranchesSchema.optional(),
} as const;

const sharedLumpDefaultFields = {
    command: tagCommandSchema.optional(),
    maximumNumberOfConcurrentBranches: z.number().optional(),
    keepHistory: z.boolean().optional(),
} as const;

export const projectJsonConfigSchema = z
    .object({
        projectName: z
            .string()
            .trim()
            .min(1, 'projectName must be a non-empty string')
            .refine(isValidProjectName, {
                message:
                    'projectName must use only letters, digits, underscores (_), and hyphens (-), with no spaces',
            }),
        ...sharedPrimaryFields,
        ...sharedLumpDefaultFields,
    })
    .strict();

export const localJsonConfigSchema = z
    .object({
        mode: z.enum(['shared', 'dedicated']),
        workspaceStrategy: z.enum(['checkout', 'worktree']).optional(),
        disabled: z.boolean().optional(),
        maxParallelRun: z
            .number({ error: 'maxParallelRun must be a positive integer' })
            .int({ error: 'maxParallelRun must be a positive integer' })
            .positive({ error: 'maxParallelRun must be a positive integer' })
            .optional(),
        ...sharedPrimaryFields,
        ...sharedLumpDefaultFields,
        verbose: z.boolean().optional(),
    })
    .strict();

function hasPrimarySource(value: {
    primaryBranch?: string;
    primaryBranches?: string[];
    projectBaseBranch?: string;
}): boolean {
    return (
        value.primaryBranch !== undefined ||
        value.projectBaseBranch !== undefined ||
        value.primaryBranches !== undefined
    );
}

export const resolvedProjectLocalConfigSchema = z
    .object({
        projectName: z
            .string()
            .trim()
            .min(1)
            .refine(isValidProjectName, {
                message:
                    'projectName must use only letters, digits, underscores (_), and hyphens (-), with no spaces',
            }),
        mode: z.enum(['shared', 'dedicated']),
        workspaceStrategy: z.enum(['checkout', 'worktree']),
        disabled: z.boolean().optional(),
        maxParallelRun: z
            .number()
            .int()
            .positive()
            .optional(),
        ...sharedPrimaryFields,
        ...sharedLumpDefaultFields,
        verbose: z.boolean().optional(),
    })
    .strict()
    .superRefine((value, ctx) => {
        if (!hasPrimarySource(value)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                    'primaryBranch or primaryBranches is required after merging .lumpcode/project.json and .lumpcode/local.json (either file may supply it)',
                path: ['primaryBranch'],
            });
        }
    });

export type ResolvedProjectLocalConfig = z.infer<typeof resolvedProjectLocalConfigSchema>;

export function formatZodIssues(error: z.ZodError): string {
    return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}
