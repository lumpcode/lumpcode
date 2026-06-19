import { describe, it, expect } from 'vitest';
import { MakePromptFnFromTemplateInput, MakePromptFnFromTemplateOutput, makePromptFnFromTemplate } from "./main";

const inputs: MakePromptFnFromTemplateInput[] = [
    ["Refactor the file @{MAIN} to follow the rules"],
    ["Refactor the file @{MAIN} to follow the rules. Add {numberOfItems} components at the end of the file"],
    ["Compare @{A} with @{A} and @{B}"],
]

const outputs: {
    input: Parameters<MakePromptFnFromTemplateOutput>[0];
    expectedOutput: string;
}[][] = [
    [
        {
            input: {
                context: {
                    name: "testContext",
                    variables: {
                        MAIN: "packages/app/index.js",
                    },
                },
            },
            expectedOutput: "Refactor the file @packages/app/index.js to follow the rules"
        }
    ],
    [
        {
            input: {
                context: {
                    name: "testContext2",
                    variables: {
                        MAIN: "packages/app/index2.js",
                        numberOfItems: "10",
                    },
                },
            },
            expectedOutput: "Refactor the file @packages/app/index2.js to follow the rules. Add 10 components at the end of the file"
        }
    ],
    [
        {
            input: {
                context: {
                    name: "repeatContext",
                    variables: {
                        A: "src/a.ts",
                        B: "src/b.ts",
                    },
                },
            },
            expectedOutput: "Compare @src/a.ts with @src/a.ts and @src/b.ts",
        },
    ],
];

describe("makePromptFnFromTemplate", () => {
    it("Should match all expected outputs", () => {
        for (let i = 0; i < inputs.length; i++) {
            const input = inputs[i];
            const outputTestForFnList = outputs[i];

            const outputFn = makePromptFnFromTemplate(...input);

            for (const outputTestForFn of outputTestForFnList) {
                const outputFromFn = outputFn(outputTestForFn.input);
                expect(outputFromFn).toEqual(outputTestForFn.expectedOutput);
            }
        }
    });
});