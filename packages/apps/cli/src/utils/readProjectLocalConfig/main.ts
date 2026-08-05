import * as z from 'zod';

import type { Failure, Success } from '@lumpcode/core';

import type { ResolvedProjectLocalConfig } from '../../types/ResolvedProjectLocalConfig';

/**
 * Placeholder until the real Zod schema lands in implementation.
 * Type tests (T1) assert `ResolvedProjectLocalConfig` equals `z.infer` of this.
 */
export const resolvedProjectLocalConfigSchema = z.any();

/**
 * Merge project.json + local.json (local wins), default workspaceStrategy,
 * validate resolved primary. Stub for clean-local-project-json-config (testImpl).
 */
export async function readProjectLocalConfig(_input: {
    localConfigFolderPath: string;
}): Promise<Success<ResolvedProjectLocalConfig> | Failure<string>> {
    throw new Error('not implemented');
}
