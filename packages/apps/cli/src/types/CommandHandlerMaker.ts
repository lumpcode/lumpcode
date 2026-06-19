import { CommandHandler } from "./CommandHandler";
import { CommandOutput } from "./CommandOutput";

export type CommandHandlerMaker<
INJ extends object,
I extends object,
O extends CommandOutput,
E extends CommandOutput = CommandOutput
> = (injections: INJ) => CommandHandler<I, O, E>;