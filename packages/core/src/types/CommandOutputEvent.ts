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
    };
