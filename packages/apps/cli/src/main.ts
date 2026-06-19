import { Command } from "commander";
import path from "node:path";
import os from "node:os";

import * as commands from './commands';
import { CommandHandlerMaker } from "./types";
import { addCommand } from "./utils/addCommand/main";
import pkg from "../package.json";

type HandlerMakersInjections = {
    [K in keyof typeof commands]: typeof commands[K]['handlerMaker'] extends CommandHandlerMaker<
    infer INJ, infer I, infer O, infer E
    > ? INJ : never;
}

async function makeProgram(input: {
    injections: HandlerMakersInjections;
}) {
    const { injections } = input;

    const program = new Command()
        .name('lumpcode')
        .version(pkg.version, '-v, --version');
    
    const unregisteredCommandNames = new Set(['login', 'logout']);

    for (const [commandExportKey, commandInfo] of Object.entries(commands)) {
        if (unregisteredCommandNames.has(commandInfo.name)) {
            continue;
        }
        const { handlerMaker, name, inputSchema, description } = commandInfo;
        const handler = handlerMaker(injections[commandExportKey as keyof HandlerMakersInjections] as any);
        await addCommand(inputSchema, handler as any, name, description)(program);
    }

    return program;
}

export async function main() {
    const localConfigFolderPath = path.join(process.cwd(), '.lumpcode');
    const globalConfigFolderPath = path.join(os.homedir(), '.lumpcode');
    const program = await makeProgram({
        injections: {
            clean: {
                projectRoot: process.cwd(),
            },
            login: {
                authFilePath: undefined,
                isAuthenticatedFn: undefined,
                loginApiFn: undefined,
            },
            logout: {
                authFilePath: undefined,
            },
            projectSetup: {},
            lumpCreate: {
                projectRoot: process.cwd(),
            },
            lumpStatus: {
                projectRoot: process.cwd(),
                localConfigFolderPath,
            },
            contextStatus: {
                projectRoot: process.cwd(),
                localConfigFolderPath,
            },
            run: {
                projectRoot: process.cwd(),
                localConfigFolderPath,
                globalConfigFolderPath,
            },
            lumpPlan: {
                projectRoot: process.cwd(),
                localConfigFolderPath,
                globalConfigFolderPath,
            },
            start: {
                projectRoot: process.cwd(),
                localConfigFolderPath,
                globalConfigFolderPath,
            },
            stop: {
                projectRoot: process.cwd(),
                localConfigFolderPath,
                globalConfigFolderPath,
            },
            restart: {
                projectRoot: process.cwd(),
                localConfigFolderPath,
                globalConfigFolderPath,
            },
            daemonStatus: {
                projectRoot: process.cwd(),
                localConfigFolderPath,
                globalConfigFolderPath,
            },
            daemonLog: {
                projectRoot: process.cwd(),
                localConfigFolderPath,
                globalConfigFolderPath,
            },
            resetPresets: {
                globalConfigFolderPath,
            },
        },
    });

    program.parse();
}