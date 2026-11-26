import type { Agent, CommandFn, CreateAgentInput, LumpVariables } from '@lumpcode/core';

import type { CommandModule } from '../../types/CommandModule';

export type LoadCliCommandModule = (commandName: string) => Promise<CommandModule>;

export function createCliAgent(_input: {
    commandModules: Map<string, CommandModule>;
    loadCommandModule: LoadCliCommandModule;
    defaultCommand?: string | CommandFn;
}): (input: CreateAgentInput<LumpVariables>) => Agent {
    return () => {
        throw new Error('createCliAgent is not implemented.');
    };
}
