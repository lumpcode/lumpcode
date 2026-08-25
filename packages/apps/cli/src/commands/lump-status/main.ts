import * as z from 'zod';

import { failure, success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import { ContextStatusRecord } from '../../types/ContextStatusRecord';
import { commandFailure } from '../../utils/commandFailure';
import { contextStatusRecordPath } from '../../utils/contextStatusRecordPath';
import { discoverLoadableLumpNames } from '../../utils/discoverLoadableLumpNames';
import { applyLumpConfigDefaults } from '../../utils/applyLumpConfigDefaults';
import { getJsConfigFromLumpName } from '../../utils/getJsConfigFromLumpName';
import { readProjectLocalConfig } from '../../utils/readProjectLocalConfig';
import { resolveEffectiveDiscoveryBranch } from '../../utils/resolveEffectiveDiscoveryBranch';
import { resolveLumpBaseBranch } from '../../utils/resolveLumpBranches';
import { resolvePrimaryBranch } from '../../utils/resolvePrimaryBranches';
import { updateContextStatusRecord } from '../../utils/updateContextStatusRecord';
import { validateCurrentLumpProjectRoot } from '../../utils/validateCurrentLumpProjectRoot';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        lumpName: z.string().optional().describe('Name of the lump to inspect'),
        silent: z
            .boolean()
            .optional()
            .describe('Print summary lines only; omit pretty-printed status JSON (default is verbose output)'),
        discoveryBranch: z
            .string()
            .optional()
            .describe(
                'Concrete discovery branch for context filtering (must match lump discovery rules; required when rules are pattern-only)',
            ),
    }),
    arguments: z.object({}),
});

export type Input = z.infer<typeof inputSchema>;

export type Output = {
    messages: string[];
    data?: {
        statusByLump: Record<string, ContextStatusRecord>;
    };
};

export interface Injections {
    projectRoot: string;
    localConfigFolderPath: string;
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const { projectRoot, localConfigFolderPath } = injections;
    const { lumpName: rawLumpName, json: jsonOutput } = input.options;
    const show = input.options.silent !== true;

    const validationResult = await validateCurrentLumpProjectRoot({ cwd: projectRoot });
    if (!validationResult.success) return commandFailure(validationResult.data);

    const resolvedResult = await readProjectLocalConfig({ localConfigFolderPath });
    if (!resolvedResult.success) return commandFailure(resolvedResult.data);
    const localConfig = resolvedResult.data;
    const discoveryBranchOpt = input.options.discoveryBranch?.trim() || undefined;

    const lumpNameOpt = rawLumpName?.trim() ? rawLumpName.trim() : undefined;

    const lumpNames = lumpNameOpt
        ? [lumpNameOpt]
        : await discoverLoadableLumpNames({ localConfigFolderPath });

    if (lumpNames.length === 0) {
        const hint = lumpNameOpt
            ? `No lump named "${lumpNameOpt}" with a loadable config (config.json or config.js).`
            : 'No lumps with a loadable config (config.json or config.js) were found under .lumpcode/lumps.';
        return failure({ messages: [hint] });
    }

    const statusByLump: Record<string, ContextStatusRecord> = {};

    for (const lumpName of lumpNames) {
        const jsConfResult = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
        if (!jsConfResult.success) {
            return failure({
                messages: [`Lump "${lumpName}": ${jsConfResult.data}`],
            });
        }
        const jsConfig = applyLumpConfigDefaults({
            jsConfig: jsConfResult.data,
            resolved: resolvedResult.data,
        });

        const discoveryResult = await resolveEffectiveDiscoveryBranch({
            discoveryBranchOpt,
            lumpName,
            localConfigFolderPath,
            localConfig,
            honorDiscoveryBranchOptInShared: true,
        });
        if (!discoveryResult.success) {
            return failure({ messages: [discoveryResult.data] });
        }

        const resolvedBaseBranch = resolveLumpBaseBranch({
            lumpConfig: jsConfig,
            primaryBranch: resolvePrimaryBranch(localConfig),
            mode: localConfig.mode,
            effectiveDiscoveryBranch: discoveryResult.data,
        });

        const updateResult = await updateContextStatusRecord({
            projectRoot,
            lumpName,
            baseBranch: resolvedBaseBranch,
        });
        if (!updateResult.success) {
            const err = updateResult.data;
            const message =
                typeof err === 'string' ? err : 'message' in err ? String(err.message) : JSON.stringify(err);
            return failure({
                messages: [`Failed to refresh status for lump "${lumpName}": ${message}`],
            });
        }
        statusByLump[lumpName] = updateResult.data;
    }

    const writtenPaths = lumpNames
        .map((name) => contextStatusRecordPath({ projectRoot, lumpName: name }))
        .join(', ');

    const summary =
        lumpNames.length === 1
            ? `Updated context status record for lump "${lumpNames[0]}".`
            : `Updated context status records for ${lumpNames.length} lump(s).`;

    const messages: string[] = [];
    if (show) {
        if (jsonOutput) {
            messages.push(summary);
        } else {
            messages.push(JSON.stringify(statusByLump, null, 2));
        }
    } else {
        messages.push(summary);
        messages.push(`Wrote: ${writtenPaths}`);
    }

    return success({
        messages,
        data: { statusByLump },
    });
};

export const command = {
    handlerMaker,
    name: 'lump-status',
    description:
        'Refresh contextStatusRecord.json from the remote git state and print the status map for one or all lumps',
    inputSchema,
} satisfies Command;
