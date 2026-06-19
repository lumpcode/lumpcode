import { describe, expect, it } from "vitest";
import { MakeGetContextListFnFromTemplateInput, MakeGetContextListFnFromTemplateOutput, makeGetContextListFnFromTemplate } from "./main";


const inputs: MakeGetContextListFnFromTemplateInput[] = [
    [
        {
            "FOLDER": "src/components/{COMPONENT_NAME}/",
            "INDEX": "src/components/{COMPONENT_NAME}/index.ts"
        },
        undefined
    ],
    [
        {
            "FOLDER": "src/components/{COMPONENT_NAME}/",
            "INDEX": "src/components/{COMPONENT_NAME}/index.ts",
            "COMPONENT": "src/components/{COMPONENT_NAME}/$pascalCase{COMPONENT_NAME}.tsx",
        },
        undefined
    ],
    [
        {
            "MAIN": "{FILE_NAME}.ts",
        },
        undefined
    ]
]

const outputs: {
    input: Parameters<MakeGetContextListFnFromTemplateOutput>[0];
    expectedOutput: Awaited<ReturnType<MakeGetContextListFnFromTemplateOutput>>;
}[][] = [
    [
        {
            input: {
                lumpVariables: {},
                codeBasePaths: [
                    {
                        isDir: true,
                        path: "src/components",
                    },
                    {
                        isDir: true,
                        path: "src/components/button",
                    },
                    {
                        isDir: false,
                        path: "src/components/button/index.ts",
                    },
                    {
                        isDir: true,
                        path: "src/components/form",
                    },
                    {
                        isDir: false,
                        path: "src/components/form/index.ts",
                    },
                    {
                        isDir: false,
                        path: "src/components/form/index.ts",
                    },
                    {
                        isDir: false,
                        path: "src/somethingElse/index.ts",
                    },
                    {
                        isDir: false,
                        path: "src/anotherThing/index.ts",
                    }
                ]
            },
            expectedOutput: [
                {
                    name: "button",
                    variables: {
                        FOLDER: "src/components/button/",
                        INDEX: "src/components/button/index.ts",
                    },
                },
                {
                    name: "form",
                    variables: {
                        FOLDER: "src/components/form/",
                        INDEX: "src/components/form/index.ts",
                    },
                }
            ]
        }
    ],
    [
        {
            input: {
                lumpVariables: {},
                codeBasePaths: [
                    {
                        isDir: true,
                        path: "src/components",
                    },
                    {
                        isDir: true,
                        path: "src/components/button",
                    },
                    {
                        isDir: false,
                        path: "src/components/button/index.ts",
                    },
                    {
                        isDir: false,
                        path: "src/components/button/Button.tsx",
                    },
                    {
                        isDir: true,
                        path: "src/components/importantForm",
                    },
                    {
                        isDir: false,
                        path: "src/components/importantForm/index.ts",
                    },
                    {
                        isDir: false,
                        path: "src/components/importantForm/ImportantForm.tsx",
                    },
                    {
                        isDir: false,
                        path: "src/somethingElse/index.ts",
                    },
                    {
                        isDir: false,
                        path: "src/anotherThing/index.ts",
                    }
                ]
            },
            expectedOutput: [
                {
                    name: "button",
                    variables: {
                        FOLDER: "src/components/button/",
                        INDEX: "src/components/button/index.ts",
                        COMPONENT:  "src/components/button/Button.tsx",
                    },
                },
                {
                    name: "importantForm",
                    variables: {
                        FOLDER: "src/components/importantForm/",
                        INDEX: "src/components/importantForm/index.ts",
                        COMPONENT:  "src/components/importantForm/ImportantForm.tsx",
                    },
                }
            ]
        }
    ],
    [
        {
            input: {
                lumpVariables: {},
                codeBasePaths: [
                    {
                        isDir: true,
                        path: "src/components",
                    },
                    {
                        isDir: true,
                        path: "src/components/button",
                    },
                    {
                        isDir: false,
                        path: "src/components/button/index.ts",
                    },
                    {
                        isDir: false,
                        path: "src/components/button/Button.ts",
                    },
                    {
                        isDir: true,
                        path: "src/components/importantForm",
                    },
                    {
                        isDir: false,
                        path: "src/components/importantForm/index.ts",
                    },
                    {
                        isDir: false,
                        path: "src/components/importantForm/ImportantForm.ts",
                    },
                    {
                        isDir: false,
                        path: "src/somethingElse/index.ts",
                    },
                    {
                        isDir: false,
                        path: "src/anotherThing/index.ts",
                    }
                ]
            },
            expectedOutput: [
                {
                    name: "src/components/button/index",
                    variables: {
                        MAIN: "src/components/button/index.ts",
                    },
                },
                {
                    name: "src/components/button/Button",
                    variables: {
                        MAIN: "src/components/button/Button.ts",
                    },
                },
                {
                    name: "src/components/importantForm/index",
                    variables: {
                        MAIN: "src/components/importantForm/index.ts",
                    },
                },
                {
                    name: "src/components/importantForm/ImportantForm",
                    variables: {
                        MAIN: "src/components/importantForm/ImportantForm.ts",
                    },
                },
                {
                    name: "src/somethingElse/index",
                    variables: {
                        MAIN: "src/somethingElse/index.ts",
                    },
                },
                {
                    name: "src/anotherThing/index",
                    variables: {
                        MAIN: "src/anotherThing/index.ts",
                    },
                },
            ]
        }
    ]
];

describe("makeGetContextListFnFromTemplate", () => {
    it("Should match all expected outputs", () => {
        for (let i = 0; i < inputs.length; i++) {
            const input = inputs[i];
            const outputTestForFnList = outputs[i];

            const outputFn = makeGetContextListFnFromTemplate(...input);

            for (const outputTestForFn of outputTestForFnList) {
                const outputFromFn = outputFn(outputTestForFn.input);

                expect(outputFromFn).toEqual(outputTestForFn.expectedOutput);
            }
        }
    });

    it("matches templates whose paths start with ./ against scanner paths without ./", () => {
        const fn = makeGetContextListFnFromTemplate({
            FOLDER: "./src/components/{COMPONENT_NAME}/",
            INDEX: "./src/components/{COMPONENT_NAME}/index.ts",
        });

        const out = fn({
            lumpVariables: {},
            codeBasePaths: [
                { isDir: true, path: "src/components" },
                { isDir: true, path: "src/components/button" },
                { isDir: false, path: "src/components/button/index.ts" },
                { isDir: true, path: "src/components/form" },
                { isDir: false, path: "src/components/form/index.ts" },
                { isDir: false, path: "src/somethingElse/index.ts" },
            ],
        });

        expect(out).toEqual([
            {
                name: "button",
                variables: {
                    FOLDER: "src/components/button/",
                    INDEX: "src/components/button/index.ts",
                },
            },
            {
                name: "form",
                variables: {
                    FOLDER: "src/components/form/",
                    INDEX: "src/components/form/index.ts",
                },
            },
        ]);
    });

    it("Merges options from contextOptionsFn", async () => {
        const input = inputs[0];
        const outputTest = outputs[0][0];
        const optionsFn = ({ name }: { name: string; variables: Record<string, string> }) => ({
            priority: name === "button" ? 1 : 0,
        });
        const outputFn = makeGetContextListFnFromTemplate(
            input[0],
            input[1],
            optionsFn,
        );
        const out = await outputFn(outputTest.input);
        expect(out).toEqual(
            outputTest.expectedOutput.map((c) => ({
                ...c,
                options: { priority: c.name === "button" ? 1 : 0 },
            })),
        );
    });
});
