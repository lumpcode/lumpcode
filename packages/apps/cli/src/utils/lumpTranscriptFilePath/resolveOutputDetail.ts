import type { Logger, LumpVariables, StepVariables } from '@lumpcode/core';

import type { OutputDetail } from '../../types/OutputDetail';

function isOutputDetail(value: unknown): value is OutputDetail {
    return value === 'loud' || value === 'quiet';
}

export function resolveOutputDetail({
    lumpVariables = {},
    stepVariables = {},
    logger,
}: {
    lumpVariables?: LumpVariables;
    stepVariables?: StepVariables;
    logger?: Pick<Logger, 'warn'>;
} = {}): OutputDetail {
    const value = stepVariables.outputDetail !== undefined
        ? stepVariables.outputDetail
        : lumpVariables.outputDetail;
    if (value === undefined) return 'loud';
    if (!isOutputDetail(value)) {
        logger?.warn(`Invalid outputDetail value: ${JSON.stringify(value)}; using 'loud'.`);
        return 'loud';
    }
    return value;
}
