import type { BranchWorkspaceBusyError } from '../branchWorkspaceLock';
import type { ExecutionWorkspaceBusyError } from '../executionWorkspaceLock';

export type RunLumpFromJsConfigFailure =
    | { kind: 'message'; message: string }
    | ({ kind: 'branchWorkspaceBusy' } & BranchWorkspaceBusyError)
    | ({ kind: 'executionWorkspaceBusy' } & ExecutionWorkspaceBusyError);

export function runLumpFromJsConfigFailureMessage(failure: RunLumpFromJsConfigFailure): string {
    return failure.message;
}

export function isRunLumpBranchWorkspaceBusyFailure(
    failure: RunLumpFromJsConfigFailure,
): failure is Extract<RunLumpFromJsConfigFailure, { kind: 'branchWorkspaceBusy' }> {
    return failure.kind === 'branchWorkspaceBusy';
}

export function isRunLumpExecutionWorkspaceBusyFailure(
    failure: RunLumpFromJsConfigFailure,
): failure is Extract<RunLumpFromJsConfigFailure, { kind: 'executionWorkspaceBusy' }> {
    return failure.kind === 'executionWorkspaceBusy';
}

export function toRunLumpMessageFailure(message: string): RunLumpFromJsConfigFailure {
    return { kind: 'message', message };
}

export function branchWorkspaceBusyFailure(
    error: BranchWorkspaceBusyError,
): Extract<RunLumpFromJsConfigFailure, { kind: 'branchWorkspaceBusy' }> {
    return { kind: 'branchWorkspaceBusy', ...error };
}

export function executionWorkspaceBusyFailure(
    error: ExecutionWorkspaceBusyError,
): Extract<RunLumpFromJsConfigFailure, { kind: 'executionWorkspaceBusy' }> {
    return { kind: 'executionWorkspaceBusy', ...error };
}
