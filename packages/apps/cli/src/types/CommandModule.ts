import { CommandFn, LumpVariables, SetupFn, StepVariables, TeardownFn } from "@lumpcode/core";

import type { PresentOutputFnFactory } from "./PresentOutputFn";

export interface CommandModule<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> {
    command: CommandFn<V, SV>;
    setup?: SetupFn<V>;
    teardown?: TeardownFn<V>;
    /** Factory so parallel lump lines do not share a parse buffer. */
    presentOutput?: PresentOutputFnFactory<V, SV>;
}
