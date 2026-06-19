import * as z from 'zod';
import { Command, Argument } from "commander";

import { CommandOutput } from '../../types';
import { cliLog } from '../cliLog';
import { CommandHandler } from '../../types/CommandHandler';
import { CommandInputSchema } from '../../types/CommandInputSchema';

export type AddCommandDeps = {
    exit?: (code: number) => never;
};

function emitCliError(
    messages: string[],
    jsonRequested: boolean,
    exit: (code: number) => never,
): never {
    if (jsonRequested) {
        cliLog({ messages }, true, true);
    } else {
        cliLog({ messages }, false, true);
    }
    exit(1);
}

export function addCommand<
    INPUT_SCHEMA extends CommandInputSchema,
    HANDLER extends CommandHandler<z.infer<INPUT_SCHEMA>, CommandOutput>,
>(
    inputSchema: INPUT_SCHEMA,
    handler: HANDLER,
    commandName: string,
    commandDescription: string,
    deps: AddCommandDeps = {},
) {
    const exit = deps.exit ?? process.exit;

    return async (
        program: Command,
    ) => {
        const command = program.command(commandName).description(commandDescription).showHelpAfterError();
        const schemaShape = inputSchema.shape;

        const optionsSchema = schemaShape.options.shape;
        const argumentsSchema = schemaShape.arguments.shape;

        const argOrder: string[] = [];
        const argTokens: string[] = [];

        for (const [key, value] of Object.entries(argumentsSchema)) {
            if (value instanceof z.ZodString || value instanceof z.ZodNumber || value instanceof z.ZodBoolean) {
                const argumentType = value.type;
                const isOptional = value.safeParse(undefined).success;
                argOrder.push(key);
                const argKey = isOptional ? `[${key}]` : `<${key}>`;
                argTokens.push(argKey);
                command.addArgument(
                    new Argument(argKey, argumentType)
                )
            }
        }

        command.usage([...argTokens, '[options]'].join(' '));

        for (const [key, value] of Object.entries(optionsSchema)) {
            let inner = value;
            let isOptional = false;

            if (value instanceof z.ZodOptional) {
                inner = value.unwrap();
                isOptional = true;
            }

            if (inner instanceof z.ZodString || inner instanceof z.ZodNumber || inner instanceof z.ZodBoolean) {
                const optionType = inner.type;
                if (!isOptional) {
                    isOptional = inner.safeParse(undefined).success;
                }


                if (inner instanceof z.ZodBoolean && isOptional) {
                    command.option(`--${key}`, inner.description ?? '');
                }
                else {
                    command[isOptional ? 'option' : 'requiredOption'](
                        `--${key} <${optionType}>`,
                        inner.description
                    );
                }
            }
            else if (inner instanceof z.ZodEnum) {
                if (!isOptional) {
                    isOptional = inner.safeParse(undefined).success;
                }
                const choices = (inner.options as string[]).join('|');
                command[isOptional ? 'option' : 'requiredOption'](
                    `--${key} <${choices}>`,
                    inner.description,
                );
            }
            else {
                emitCliError(
                    [`Unsupported option: key: ${key}, value: ${String(value)}`],
                    false,
                    exit,
                );
            }
        }

        command.action(async (...argsAndOpts) => {
            const opts = argsAndOpts.slice(-2, -1)[0] as Record<string, unknown>;
            const rawArgs = argsAndOpts.slice(0, -2);
            const args = Object.fromEntries(argOrder.map((arg, index) => [arg, rawArgs[index]]));

            const jsonRequested = opts.json === true;

            let parsedOpts: Record<string, string | number | boolean>;
            try {
                parsedOpts = parseArgsOrOpts(opts, optionsSchema, jsonRequested, exit);
            } catch {
                return;
            }
            let parsedArgs: Record<string, string | number | boolean>;
            try {
                parsedArgs = parseArgsOrOpts(args as Record<string, unknown>, argumentsSchema, jsonRequested, exit);
            } catch {
                return;
            }

            const validatedInput = inputSchema.safeParse({
                options: parsedOpts,
                arguments: parsedArgs,
            });
            if (!validatedInput.success) {
                const error = validatedInput.error;
                const messages = error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
                if (jsonRequested) {
                    emitCliError([`Invalid input: ${messages.join('; ')}`], true, exit);
                } else {
                    emitCliError(
                        [`Invalid input:`, ...messages.map((message) => `  ${message}`)],
                        false,
                        exit,
                    );
                }
            }
            const handlerResult = await handler(validatedInput.data);
            cliLog(handlerResult.data, !!parsedOpts.json, !handlerResult.success);
            if (!handlerResult.success) {
                exit(1);
            }
        });

        return command;
    }
}

function parseArgsOrOpts(
    argsAndOpts: Record<string, unknown>,
    schema: z.ZodRawShape,
    jsonRequested: boolean,
    exit: (code: number) => never,
) {
    const res: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(schema)) {
        let inner = value;

        if (value instanceof z.ZodOptional) {
            inner = value.unwrap();
        }

        if (inner instanceof z.ZodString || inner instanceof z.ZodNumber || inner instanceof z.ZodBoolean) {
            const optionType: 'string' | 'number' | 'boolean' = inner.type;
            const raw = argsAndOpts[key];

            if (raw === undefined || raw === '' || raw === null) {
                continue;
            }

            if (optionType === 'string') {
                res[key] = typeof raw === 'string' ? raw : String(raw);
            }
            else if (optionType === 'number') {
                const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
                res[key] = n;
            }
            else if (optionType === 'boolean') {
                if (typeof raw !== 'boolean') {
                    const message = `Invalid input:\n  options.${key}: expected boolean from CLI, got ${typeof raw}`;
                    emitCliError(
                        jsonRequested ? [message.replace(/\n/g, ' ')] : [message],
                        jsonRequested,
                        exit,
                    );
                }
                res[key] = raw;
            }
            else {
                emitCliError(
                    [`Unsupported option type: ${optionType}`],
                    jsonRequested,
                    exit,
                );
            }
        }
        else if (inner instanceof z.ZodEnum) {
            const raw = argsAndOpts[key];
            if (raw === undefined || raw === '' || raw === null) continue;
            res[key] = typeof raw === 'string' ? raw : String(raw);
        }
    }
    return res;
}
