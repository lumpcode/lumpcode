import { CommandFn, LumpVariables, SetupFn, StepVariables, TeardownFn } from "@lumpcode/core";

// testImpl stub: accept <V, SV>; command / setup / teardown not refined until implementation
export interface CommandModule<
    _V extends LumpVariables = LumpVariables,
    _SV extends StepVariables = StepVariables,
> {
    command: CommandFn;
    setup?: SetupFn;
    teardown?: TeardownFn;
}
