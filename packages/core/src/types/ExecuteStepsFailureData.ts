import type { ExecuteStepsFailureReason } from './ExecuteStepsFailureReason';

export type ExecuteStepsFailureData = {
    message: string;
    reason?: ExecuteStepsFailureReason;
};
