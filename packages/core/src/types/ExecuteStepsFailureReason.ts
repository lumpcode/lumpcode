export type ExecuteStepsFailureReason =
    | 'stepWalkFailed'
    | 'workspaceTeardownFailed'
    | 'gitAddCommitFailed'
    | 'workflowNotPushed'
    | 'workflowThrew';
