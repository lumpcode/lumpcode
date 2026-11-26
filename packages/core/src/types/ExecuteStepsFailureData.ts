import type { ContextResult } from './ContextResult';
import type { ExecuteStepsFailureReason } from './ExecuteStepsFailureReason';

export type ExecuteStepsFailureData = {
    message: string;
    reason?: ExecuteStepsFailureReason;
    /** Contexts that produced a result before the run failed. */
    contextResults?: ContextResult[];
};
