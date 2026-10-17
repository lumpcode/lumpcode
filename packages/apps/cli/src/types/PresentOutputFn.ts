import { LumpVariables, StepVariables } from '@lumpcode/core';

import type { OutputDetail } from './OutputDetail';

export type PresentOutputFn = (input: {
    stream: 'stdout' | 'stderr';
    chunk: string;
    outputDetail: OutputDetail;
}) => string | undefined;

export type PresentOutputFnFactoryInput<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = {
    lumpVariables: V;
    stepVariables?: SV;
    contextName: string;
    stepIndex: number | number[];
    executable: string;
    commandName?: string;
};

export type PresentOutputFnFactory<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = (input: PresentOutputFnFactoryInput<V, SV>) => PresentOutputFn;
