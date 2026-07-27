import type { LumpVariables, StepVariables } from "@lumpcode/core";

import { LumpJsConfig, LumpJsConfigStep, LumpJsConfigSteps } from "../../types";

export function normalizeSteps<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>({
    prompt: originalPrompt,
    jsSteps: originalJsSteps,
}: {
    prompt: LumpJsConfig<V, SV>['prompt'];
    jsSteps: LumpJsConfig<V, SV>['steps'];
}): LumpJsConfigSteps<V, SV> {

    const { prompt, jsSteps } = normalizePromptAndSteps({
        prompt: originalPrompt,
        jsSteps: originalJsSteps,
    });


    if (jsSteps && Array.isArray(jsSteps)) {
        return jsSteps;
    }

    const configStep: LumpJsConfigStep<V, SV> =
    typeof prompt === 'function'
        ? ({ promptFn: prompt } as LumpJsConfigStep<V, SV>)
        : typeof prompt === 'string'
            ? ({ promptTemplate: prompt } as LumpJsConfigStep<V, SV>)
            : (prompt as LumpJsConfigStep<V, SV>);

    return [configStep];
}

function normalizePromptAndSteps<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>({
    prompt,
    jsSteps,
}: {
    prompt: LumpJsConfig<V, SV>['prompt'];
    jsSteps: LumpJsConfig<V, SV>['steps'];
}): {
    prompt: LumpJsConfig<V, SV>['prompt'];
    jsSteps: LumpJsConfigSteps<V, SV> | undefined;
} {
    if (jsSteps !== undefined && !Array.isArray(jsSteps)) {
        // Solo dynamic steps fn must stay in the steps walk, not become promptFn.
        if (typeof jsSteps === 'function') {
            return { prompt, jsSteps: [jsSteps] };
        }
        return { prompt: jsSteps, jsSteps: undefined };
    }
    return { prompt, jsSteps };
}
