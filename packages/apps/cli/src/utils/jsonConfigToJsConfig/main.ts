import type { LumpVariables } from "@lumpcode/core";
import type { LumpJsonConfig } from "../../types/LumpJsonConfig";
import type { LumpJsConfig } from "../../types/LumpJsConfig";
import type { LumpJsConfigStep } from "../../types/LumpJsConfigStep";
import type { LumpJsonConfigStep } from "../../types/LumpJsonConfigStep";

const jsonConfigStepToJsConfigStep = (
    item: LumpJsonConfigStep,
): LumpJsConfigStep => ({ ...item }) as LumpJsConfigStep;

export const jsonConfigToJsConfig = <V extends LumpVariables = LumpVariables>(
    jsonConfig: LumpJsonConfig<V>,
): LumpJsConfig<V> => {
    const {
        prompt: rawPrompt,
        steps: rawSteps,
        ...rest
    } = jsonConfig;
    const prompt = rawPrompt as LumpJsonConfigStep | undefined;
    const steps = rawSteps as (LumpJsonConfigStep | string)[] | undefined;

    return {
        ...rest,
        ...(prompt !== undefined && {
            prompt: jsonConfigStepToJsConfigStep(prompt),
        }),
        ...(steps !== undefined && {
            steps: steps.map(item =>
                typeof item === 'string' ? item : jsonConfigStepToJsConfigStep(item)
            ),
        }),
    };
};
