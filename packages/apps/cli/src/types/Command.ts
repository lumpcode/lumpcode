import * as z from 'zod';

import { CommandHandlerMaker } from "./CommandHandlerMaker";
import { CommandOutput } from "./CommandOutput";

export type Command<
    INJ extends object = any,
    I extends object = any,
    O extends CommandOutput = CommandOutput,
    E extends CommandOutput = CommandOutput
> = {
    name: string;
    description: string;
    inputSchema: z.ZodObject<any>;
    handlerMaker: CommandHandlerMaker<INJ, I, O, E>;
    defaultInjections?: INJ;
}