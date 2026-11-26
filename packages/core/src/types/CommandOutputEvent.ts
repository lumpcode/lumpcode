import { ContextResult } from './ContextResult';
import { LumpVariables } from './LumpVariables';
import { StepVariables } from './StepVariables';

export type CommandOutputEvent =
    | {
        kind: 'start';
        contextName: string;
        stepIndex: number | number[];
        executable: string;
        commandName?: string;
        lumpVariables?: LumpVariables;
        stepVariables?: StepVariables;
        callKind?: 'prompt' | 'shell';
        label?: string;
        sessionId?: string;
    }
    | {
        kind: 'chunk';
        contextName: string;
        stepIndex: number | number[];
        stream: 'stdout' | 'stderr';
        chunk: string;
    }
    | {
        kind: 'end';
        contextName: string;
        stepIndex: number | number[];
        succeeded: boolean;
        exitCode?: number | null;
        timedOut?: boolean;
    }
    | {
        kind: 'log';
        contextName: string;
        message: string;
    }
    | {
        kind: 'workflowEnd';
        contextName: string;
        result: ContextResult['result'];
    };
