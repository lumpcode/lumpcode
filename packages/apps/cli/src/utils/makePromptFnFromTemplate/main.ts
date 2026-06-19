import { PromptFnInput, PromptFnOutput } from "@lumpcode/core";

export function makePromptFnFromTemplate(
    promptTemplate: MakePromptFnFromTemplateInput[0]
): MakePromptFnFromTemplateOutput {
    const retFunction : MakePromptFnFromTemplateOutput = ({
        context
    }) => {
        const { variables } = context;

        let ret = promptTemplate;

        for (const variableKey in variables) {
            const variableVal = variables[variableKey];
            const placeholder = `{${variableKey}}`;
            ret = ret.split(placeholder).join(variableVal);
        }

        return ret;
    };
    return retFunction;
}

export type MakePromptFnFromTemplateInput = [promptTemplate: string];

export type MakePromptFnFromTemplateOutput = (
    params: Pick<PromptFnInput, 'context'>,
) => PromptFnOutput;
