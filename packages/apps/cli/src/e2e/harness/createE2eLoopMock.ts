/** Lump `config.js` mirroring dumb/config.js: validate, recurse, exit after mocked success. */
export function createE2eLoopLumpConfigJs(input: {
    lumpName: string;
    contextName: string;
    /** Validation failures before mocked success (default 3). */
    failuresBeforeSuccess?: number;
}): string {
    const { lumpName, contextName, failuresBeforeSuccess = 3 } = input;
    const successAttempt = failuresBeforeSuccess + 1;

    return `import fs from 'node:fs';
import path from 'node:path';

const LOOP_CONTEXT = '${contextName}';
const LOOP_LUMP = '${lumpName}';
const FAILURES_BEFORE_SUCCESS = ${failuresBeforeSuccess};
const SUCCESS_ATTEMPT = ${successAttempt};

const echoOk = () => ({ executable: 'echo', args: ['ok'] });

function loopTargetPath(context) {
    return \`loop-\${context.variables.NAME}.txt\`;
}

function writeLoopMarker(attempts) {
    const markerDir = path.join('.lumpcode', 'e2e-markers', LOOP_LUMP);
    fs.mkdirSync(markerDir, { recursive: true });
    fs.writeFileSync(path.join(markerDir, \`\${LOOP_CONTEXT}.done\`), \`attempts:\${attempts}\`);
}

export default {
    baseBranch: 'main',
    getContextListFn: async () => [{ name: LOOP_CONTEXT, variables: { NAME: LOOP_CONTEXT } }],
    steps: getRecursiveSteps(),
    numberOfContextsPerBranch: 1,
};

function getRecursiveSteps() {
    return [
        {
            commandFn({ context }) {
                fs.writeFileSync(loopTargetPath(context), 'wrong content');
                return echoOk();
            },
        },
        {
            commandFn({ stepIndex }) {
                const depth = Array.isArray(stepIndex) ? stepIndex.length : 1;
                if (depth > SUCCESS_ATTEMPT) {
                    return { executable: 'echo', args: ['Loop limit reached'] };
                }
                return echoOk();
            },
            postCommandExecFn({ contextRunState }) {
                const attempt = (contextRunState.loopAttempts ?? 0) + 1;
                contextRunState.loopAttempts = attempt;
                contextRunState.loopIsValid = attempt >= SUCCESS_ATTEMPT;
            },
        },
        ({ contextRunState, stepIndex }) => {
            const depth = Array.isArray(stepIndex) ? stepIndex.length : 1;
            if (depth > SUCCESS_ATTEMPT) {
                writeLoopMarker(SUCCESS_ATTEMPT);
                return [];
            }
            if (!contextRunState.loopIsValid) {
                return getRecursiveSteps();
            }
            writeLoopMarker(contextRunState.loopAttempts ?? SUCCESS_ATTEMPT);
            return [];
        },
    ];
}
`;
}
