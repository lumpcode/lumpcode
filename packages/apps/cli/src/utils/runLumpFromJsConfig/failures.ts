import type { WorkspacePathBusyError } from '../workspacePathLock';

export type RunLumpFromJsConfigFailure =
    | { kind: 'message'; message: string }
    | ({ kind: 'workspacePathBusy' } & WorkspacePathBusyError);

export function runLumpFromJsConfigFailureMessage(failure: RunLumpFromJsConfigFailure): string {
    return failure.message;
}

export function isRunLumpWorkspacePathBusyFailure(
    failure: RunLumpFromJsConfigFailure,
): failure is Extract<RunLumpFromJsConfigFailure, { kind: 'workspacePathBusy' }> {
    return failure.kind === 'workspacePathBusy';
}

export function toRunLumpMessageFailure(message: string): RunLumpFromJsConfigFailure {
    return { kind: 'message', message };
}

export function workspacePathBusyFailure(
    error: WorkspacePathBusyError,
): Extract<RunLumpFromJsConfigFailure, { kind: 'workspacePathBusy' }> {
    return { kind: 'workspacePathBusy', ...error };
}
