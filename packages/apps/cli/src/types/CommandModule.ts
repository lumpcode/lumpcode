import { CommandFn, LumpVariables, SetupFn, StepVariables, TeardownFn } from "@lumpcode/core";

export interface CommandModule<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> {
    command: CommandFn<V, SV>;
    setup?: SetupFn<V>;
    teardown?: TeardownFn<V>;
}
