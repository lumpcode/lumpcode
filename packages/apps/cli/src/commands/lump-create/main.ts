import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as z from 'zod';

import { failure, success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import { commandFailure } from '../../utils/commandFailure';
import { assertValidLumpName } from '../../utils/isValidLumpName';
import { localConfigFolderPath } from '../../utils/localConfigFolderPath';
import { lumpDirPath } from '../../utils/lumpDirPath';
import { validateCurrentLumpProjectRoot } from '../../utils/validateCurrentLumpProjectRoot';

const CONFIG_FILE_NAMES = ['config.json', 'config.js'] as const;

type LumpConfigFormat = 'js' | 'json';

const inputSchema = z
    .object({
        options: baseCommandOptionsSchema.extend({
            config: z
                .string()
                .optional()
                .describe('Configuration file format: js or json (default json)'),
        }),
        arguments: z.object({
            lumpName: z.string().describe('The name of the lump to create'),
        }),
    })
    .superRefine((data, ctx) => {
        const raw = data.options.config ?? 'json';
        if (raw !== 'js' && raw !== 'json') {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'option config must be js or json',
                path: ['options', 'config'],
            });
        }
    });

export type Input = z.infer<typeof inputSchema>;

export type Output = {
    messages: string[];
    data?: { lumpName: string; configPath: string; configFormat: LumpConfigFormat };
};

export interface Injections {
    projectRoot: string;
}

function normalizeConfigFormat(raw: string | undefined): LumpConfigFormat {
    const v = raw ?? 'json';
    if (v === 'js' || v === 'json') return v;
    return 'json';
}

async function lumpDirHasAnyConfigFile(lumpDir: string): Promise<boolean> {
    for (const name of CONFIG_FILE_NAMES) {
        const exists = await fs
            .access(path.join(lumpDir, name))
            .then(() => true)
            .catch(() => false);
        if (exists) return true;
    }
    return false;
}

const defaultStubLinesJson = `{
  "baseBranch": "main",
  "contextListJson": {
    "FILE": "src/{NAME}.ts"
  },
  "prompt": {
    "promptTemplate": "Improve the code at @{FILE}.",
    "command": "claude"
  }
}
`;

const defaultStubLinesJs = `export default {
  baseBranch: 'main',
  contextListJson: {
    FILE: 'src/{NAME}.ts',
  },
  prompt: {
    promptTemplate: 'Improve the code at @{FILE}.',
    command: 'claude',
  },
};
`;

function fileNameForFormat(format: LumpConfigFormat): string {
    if (format === 'json') return 'config.json';
    return 'config.js';
}

function fileBodyForFormat(format: LumpConfigFormat): string {
    if (format === 'json') return defaultStubLinesJson;
    return defaultStubLinesJs;
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const { projectRoot } = injections;
    const validationResult = await validateCurrentLumpProjectRoot({ cwd: projectRoot });
    if (!validationResult.success) return commandFailure(validationResult.data);

    const lumpName = input.arguments.lumpName;
    const nameCheck = assertValidLumpName(lumpName);
    if (!nameCheck.ok) {
        return failure({ messages: [nameCheck.message] });
    }

    const configFormat = normalizeConfigFormat(input.options.config);
    const localConfig = localConfigFolderPath({ projectRoot });
    const lumpDir = lumpDirPath({ localConfigFolderPath: localConfig, lumpName });
    const hasConfig = await lumpDirHasAnyConfigFile(lumpDir);
    if (hasConfig) {
        return failure({
            messages: [
                `Lump "${lumpName}" already has a config (config.json or config.js) under ${lumpDir}`,
            ],
        });
    }

    const relativeConfigPath = path.join(
        path.relative(projectRoot, lumpDir),
        fileNameForFormat(configFormat),
    );
    const absoluteConfigPath = path.join(lumpDir, fileNameForFormat(configFormat));

    try {
        await fs.mkdir(lumpDir, { recursive: true });
        await fs.writeFile(absoluteConfigPath, fileBodyForFormat(configFormat), 'utf-8');
    } catch (error) {
        return failure({
            messages: [`Failed to write lump config: ${String(error)}`],
        });
    }

    return success({
        messages: [`Created lump "${lumpName}" at ${relativeConfigPath}`],
        data: { lumpName, configPath: relativeConfigPath, configFormat },
    });
};

export const command = {
    handlerMaker,
    name: 'lump-create',
    description: 'Create a new lump configuration file inside the current project',
    inputSchema,
} satisfies Command;
