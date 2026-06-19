import { defineConfig } from '@lumpcode/cli-types';

const getRecursiveStepsKeyIsValidSymbol = Symbol('getRecursiveStepsKeyIsValidSymbol');

const VERIFICATION_PASSED = 'VERIFICATION_PASSED';
const VERIFICATION_FAILED = 'VERIFICATION_FAILED';

function targetFilePath(context) {
    return `loop-${context.variables.NAME}.txt`;
}

function wrongFilePath(context) {
    return `wrong-${context.variables.NAME}.txt`;
}

function buildVerificationScript({ targetFile, attempt }) {
    const target = JSON.stringify(targetFile);
    const attemptNum = attempt + 1;

    return `
TARGET=${target}
ATTEMPT=${attemptNum}

echo "=============================================="
echo "  Loop-example verification (attempt $ATTEMPT)"
echo "=============================================="
echo ""
echo "[setup] Target artifact: $TARGET"
echo "[setup] Working directory: $(pwd)"
echo "[setup] Timestamp: $(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u)"
echo ""
echo "[step 1/5] Preflight — workspace permissions"
if [ -w . ]; then
  echo "  PASS: current directory is writable"
else
  echo "  WARN: current directory may not be writable"
fi
echo ""
echo "[step 2/5] Discover — files in workspace root"
ls -la . 2>/dev/null | head -20 || echo "  (unable to list directory)"
echo ""
echo "[step 3/5] Assert — expected file path"
echo "  checking: $TARGET"
echo ""
echo "[step 4/5] Existence check"
if [ -f "$TARGET" ]; then
  echo "  PASS: file exists"
  if command -v stat >/dev/null 2>&1; then
    stat "$TARGET" 2>/dev/null || true
  else
    ls -la "$TARGET" 2>/dev/null || true
  fi
  echo ""
  echo "[step 5/5] Verdict"
  echo "  ${VERIFICATION_PASSED}"
  exit 0
else
  echo "  FAIL: file not found at $TARGET"
  echo ""
  echo "[step 5/5] Verdict"
  echo "  ${VERIFICATION_FAILED}"
  echo ""
  echo "  Hint: the agent step should run: touch $TARGET"
  exit 1
fi
`.trim();
}

export default defineConfig({
    getContextListFn: async () => {
        const name = Date.now().toString();
        return [
            {
                name,
                variables: {
                    NAME: name,
                },
            },
        ];
    },
    steps: getRecursiveSteps({
        maxIterations: 5,
        getFirstSteps({ currentIteration }) {
            return [
                {
                    promptFn({ context }) {
                        const expected = targetFilePath(context);
                        if (currentIteration === 0) {
                            return [
                                `Create the loop marker file for this context.`,
                                `Expected artifact: ${expected}`,
                                `Run: touch ${wrongFilePath(context)}`,
                                `(First attempt intentionally uses the wrong path to emulate an agent mistake.)`,
                            ].join('\n');
                        }
                        return [
                            `Previous verification failed — retry creating the marker file.`,
                            `Expected artifact: ${expected}`,
                            `Run: touch ${expected}`,
                        ].join('\n');
                    },
                    commandFn({ context }) {
                        const file = currentIteration === 0
                            ? wrongFilePath(context)
                            : targetFilePath(context);
                        return {
                            executable: 'touch',
                            args: [file],
                        };
                    },
                },
            ];
        },
        validationCommandFn({ context, currentIteration }) {
            return {
                executable: 'sh',
                args: ['-c', buildVerificationScript({
                    targetFile: targetFilePath(context),
                    attempt: currentIteration,
                })],
            };
        },
        isValidationCommandResultOk({ commandResult }) {
            return commandResult.includes(VERIFICATION_PASSED);
        },
    }),
    keepHistory: true,
    verbose: false,
});

export function getRecursiveSteps({
    maxIterations = 5,
    validationCommandFn = () => null,
    isValidationCommandResultOk = () => false,
    getFirstSteps = () => [],
    currentIteration = 0,
    prevValidateCommandResult = null,
    contextRunStateIsOkFlagKey = getRecursiveStepsKeyIsValidSymbol,
}) {
    const firstSteps = getFirstSteps({ currentIteration, prevValidateCommandResult });
    let thisIterValidateCommandResult = null;

    return [
        ...firstSteps,
        {
            continueOnError: true,
            commandFn({ context, contextRunState, stepIndex }) {
                const stepIndexLen = Array.isArray(stepIndex) ? stepIndex.length : 1;
                if (stepIndexLen > maxIterations) {
                    return {
                        executable: 'echo',
                        args: ['Loop limit reached'],
                    };
                }
                if (!contextRunState[contextRunStateIsOkFlagKey]) {
                    return validationCommandFn({
                        context,
                        contextRunState,
                        stepIndex,
                        currentIteration,
                        prevValidateCommandResult,
                        contextRunStateIsOkFlagKey,
                    });
                }
                return null;
            },
            postCommandExecFn({ commandResult, contextRunState }) {
                thisIterValidateCommandResult = commandResult;
                contextRunState[contextRunStateIsOkFlagKey] = isValidationCommandResultOk({
                    commandResult,
                    contextRunState,
                    currentIteration,
                });
            },
        },
        ({ contextRunState, stepIndex }) => {
            const stepIndexLen = Array.isArray(stepIndex) ? stepIndex.length : 1;
            const loopLimitReached = stepIndexLen > maxIterations;
            if (loopLimitReached) {
                return [];
            }
            return !contextRunState[contextRunStateIsOkFlagKey]
                ? getRecursiveSteps({
                    maxIterations,
                    validationCommandFn,
                    isValidationCommandResultOk,
                    getFirstSteps,
                    currentIteration: currentIteration + 1,
                    prevValidateCommandResult: thisIterValidateCommandResult,
                    contextRunStateIsOkFlagKey,
                })
                : [];
        },
    ];
}
