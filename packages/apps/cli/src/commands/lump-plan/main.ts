import * as z from 'zod';

import { success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import { unwrapOrCommandFailure } from '../../utils/commandFailure';
import {
    planLumpFromJsConfig,
    type LumpPlanDepth,
    type PlanLumpOutput,
} from '../../utils/planLumpFromJsConfig';
import { validateCurrentLumpProjectRoot } from '../../utils/validateCurrentLumpProjectRoot';
import { globalConfigFolderPath, localConfigFolderPath } from '../../constants';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        contexts: z
            .boolean()
            .optional()
            .describe('Include resolved context list (names and variables)'),
        todoOnly: z
            .boolean()
            .optional()
            .describe('With --contexts, --prompts, or --plan: only contexts run would pick next'),
        prompts: z
            .boolean()
            .optional()
            .describe('Include per-context prompt text and agent command preview (may run user hooks)'),
        plan: z
            .boolean()
            .optional()
            .describe('Full dry-run: branch, workspace git commands, batch, and skip reasons'),
        contextName: z
            .string()
            .optional()
            .describe('Scope contexts, prompts, and plan to a single context name'),
    }),
    arguments: z.object({
        lumpName: z.string().describe('The name of the lump to preview'),
    }),
});

export type Input = z.infer<typeof inputSchema>;

export type Output = {
    messages: string[];
    data?: PlanLumpOutput;
};

export interface Injections {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
}

function resolveDepth(options: Input['options']): LumpPlanDepth {
    if (options.plan) return 'plan';
    if (options.prompts) return 'prompts';
    if (options.contexts) return 'contexts';
    return 'validate';
}

function formatHumanPlan(data: PlanLumpOutput): string[] {
    const lines: string[] = [
        `Lump "${data.lumpName}" is valid.`,
        `baseBranch: ${data.baseBranch}`,
        `executionWorkspacePath: ${data.executionWorkspacePath}`,
        `disabled: ${data.disabled}`,
    ];

    if (data.contexts) {
        lines.push(`contexts (${data.contexts.length}):`);
        for (const ctx of data.contexts) {
            lines.push(`  - ${ctx.name}`);
        }
    }

    if (data.todoContextNames?.length) {
        lines.push(`todoOnly filter: ${data.todoContextNames.join(', ')}`);
    }

    if (data.promptsByContext) {
        for (const [name, steps] of Object.entries(data.promptsByContext)) {
            lines.push(`prompts for "${name}" (${steps.length} step(s)):`);
            for (const step of steps) {
                const promptPreview = step.prompt && step.prompt.length > 0
                    ? `${step.prompt.slice(0, 80)}${step.prompt.length > 80 ? '…' : ''}`
                    : '(no prompt)';
                lines.push(`  [${JSON.stringify(step.stepIndex)}] ${promptPreview}`);
                if (step.command) {
                    lines.push(`    → ${step.command.executable} ${step.command.args.join(' ')}`);
                    if (step.command.env != null && Object.keys(step.command.env).length > 0) {
                        lines.push(`    env: ${JSON.stringify(step.command.env)}`);
                    }
                } else {
                    lines.push('    → (command skipped)');
                }
            }
        }
    }

    if (data.plan) {
        if (data.plan.skipped) {
            lines.push(`plan: skipped (${data.plan.skipped.reason})`);
            lines.push(`  ${data.plan.skipped.reasonDetail}`);
        } else {
            lines.push(`plan branch: ${data.plan.branchName ?? '(none)'}`);
            if (data.plan.contextNames?.length) {
                lines.push(`plan batch contexts: ${data.plan.contextNames.join(', ')}`);
            }
            if (data.plan.setupWorkspaceCommand) {
                lines.push('setupWorkspaceCommand:');
                lines.push(`  ${data.plan.setupWorkspaceCommand}`);
            }
            if (data.plan.teardownWorkspaceCommand) {
                lines.push(`teardownWorkspaceCommand: ${data.plan.teardownWorkspaceCommand}`);
            }
            if (data.plan.gitPushCommand) {
                lines.push(`gitPushCommand: ${data.plan.gitPushCommand}`);
            }
        }
    }

    return lines;
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const { projectRoot, localConfigFolderPath, globalConfigFolderPath } = injections;
    const lumpName = input.arguments.lumpName;
    const depth = resolveDepth(input.options);

    const validationResult = await unwrapOrCommandFailure(
        await validateCurrentLumpProjectRoot({ cwd: projectRoot }),
    );
    if (!validationResult.success) return validationResult;

    const planResult = await unwrapOrCommandFailure(
        await planLumpFromJsConfig({
            lumpName,
            localConfigFolderPath,
            globalConfigFolderPath,
            projectRoot,
            depth,
            todoOnly: input.options.todoOnly,
            contextName: input.options.contextName?.trim() || undefined,
        }),
    );
    if (!planResult.success) return planResult;

    const data = planResult.data;
    const messages = input.options.json
        ? [`Plan for lump "${lumpName}" (${depth}).`]
        : formatHumanPlan(data);

    return success({ messages, data });
};

export const command = {
    handlerMaker,
    name: 'lump-plan',
    description:
        'Preview lump config: validate hooks, list contexts, show prompts, or dry-run the next tick (no pre-flight or agent execution)',
    inputSchema,
    defaultInjections: {
        projectRoot: process.cwd(),
        localConfigFolderPath,
        globalConfigFolderPath,
    },
} satisfies Command;
