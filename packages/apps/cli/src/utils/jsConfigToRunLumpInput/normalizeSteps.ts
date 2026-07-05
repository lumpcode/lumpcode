import { LumpJsConfig, LumpJsConfigStep, LumpJsConfigSteps } from "../../types";

export function normalizeSteps({
    prompt: originalPrompt,
    jsSteps: originalJsSteps,
}: {
    prompt: LumpJsConfig['prompt'];
    jsSteps: LumpJsConfig['steps'];
}): LumpJsConfigSteps {

    const { prompt, jsSteps } = normalizePromptAndSteps({ 
        prompt: originalPrompt, 
        jsSteps: originalJsSteps 
    });


    if (jsSteps && Array.isArray(jsSteps)) {
        return jsSteps;
    }

    const configStep: LumpJsConfigStep =
    typeof prompt === 'function'
        ? ({ promptFn: prompt } as LumpJsConfigStep)
        : typeof prompt === 'string'
            ? ({ promptTemplate: prompt } as LumpJsConfigStep)
            : (prompt as LumpJsConfigStep);

    return [configStep];
}

function normalizePromptAndSteps({
    prompt,
    jsSteps,
}: {
    prompt: LumpJsConfig['prompt'];
    jsSteps: LumpJsConfig['steps'];
}): { prompt: LumpJsConfig['prompt']; jsSteps: LumpJsConfigSteps | undefined } {
    if (jsSteps !== undefined && !Array.isArray(jsSteps)) {
        return { prompt: jsSteps, jsSteps: undefined };
    }
    return { prompt, jsSteps };
}