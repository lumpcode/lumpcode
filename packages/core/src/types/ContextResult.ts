import type { Context } from './Context';
import type { StepVariables } from './StepVariables';
import type { WorkflowResult } from './Workflow';

export type ContextResultOutcome = 'pushed' | 'notPushed' | 'failed' | 'aborted';

export interface ContextResult<SV extends StepVariables = StepVariables> {
    context: Context;
    outcome: ContextResultOutcome;
    /** Normalized. void or a steps success → succeeded and push true. A throw → succeeded and push false, with message. */
    result: Required<Pick<WorkflowResult<SV>, 'succeeded' | 'push'>> & Pick<WorkflowResult<SV>, 'message' | 'variables'>;
}
