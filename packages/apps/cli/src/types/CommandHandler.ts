import { Failure, Success } from "@lumpcode/core";
import { CommandOutput } from "./CommandOutput";

export type CommandHandler<I extends object, O extends CommandOutput, E extends CommandOutput = CommandOutput> = (input: I) => Promise<Success<O> | Failure<E>>;