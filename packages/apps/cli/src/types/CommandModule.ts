import { CommandFn, SetupFn, TeardownFn } from "@lumpcode/core";

export interface CommandModule {
    command: CommandFn;
    setup?: SetupFn;
    teardown?: TeardownFn;
}