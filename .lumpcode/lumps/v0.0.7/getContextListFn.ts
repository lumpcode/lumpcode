import fs from 'fs/promises';
import path from 'path';
import { load as loadYaml } from 'js-yaml';
import { Context, Steps } from '@lumpcode/cli-types';
import { getContextStatus } from '@lumpcode/cli-utils';
import { fileURLToPath } from 'url';
import { CommandDescriptor } from '@lumpcode/core';

type TodoYamlItem = {
    name: string;
    type: 'feature' | 'documentation' | 'misc';
    task: string;
    priority: number;
    dependsOn?: string[];
    done?: boolean;
    implementWithoutPrd?: boolean;
    implementTestsWithFeature?: boolean;
    refs?: string[];
}

export type ContextVariables = {
    TYPE: 'feature' | 'documentation' | 'misc';
    TASK_NAME: string;
    TASK: string;
    NEXT_FLOW?: 'prd' | 'testPlan' | 'tests_impl' | 'impl';
    TODOS_FILE: string;
    REF?: string;
    PRD_FILE?: string;
    TEST_PLAN_FILE?: string;
}

async function fileExists(filePath: string) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

function* iterateTodoItems(doc: TodoYamlItem[]) {
    if (!Array.isArray(doc)) {
        throw new Error('TODO.yaml must be a flat list of tasks');
    }

    for (const item of doc) {
        if (item.done) {
            console.log(`TODO.yaml task ${item.name} is done, skipping`);
            continue;
        }

        if (!item.name) {
            console.error('TODO.yaml task missing name');
            continue;
        }

        yield item;
    }
}

async function loadPendingTodoContexts({ lumpDir, lumpName }) {
    const todoPath = path.join('.lumpcode', 'lumps', 'v0.0.7', 'TODO.yaml');
    console.log('todoPath', todoPath);
    const raw = await fs.readFile(todoPath, 'utf-8');
    const doc = loadYaml(raw) as TodoYamlItem[];

    const contexts: Context[] = [];

    for (const item of iterateTodoItems(doc)) {
        const dependsOnContexts = (item.dependsOn ?? []);

        const itemType = item.type;

        const contextToPush = {
            name: item.name,
            variables: {
                TYPE: itemType,
                TASK_NAME: item.name,
                TASK: item.task,
                TODOS_FILE: todoPath,
            },
            options: {
                priority: item.priority,
                dependsOnContexts,
            },
        };

        if (itemType === 'feature') {
            const prdFilePath = path.join('.lumpcode', 'lumps', 'v0.0.7', 'prds', `${item.name}.prd.md`);
            const testPlanFilePath = path.join('.lumpcode', 'lumps', 'v0.0.7', 'testPlans', `${item.name}.test.md`);
            const nextFlow = await getFeatureNextFlow(item);
            
            if (!nextFlow) continue;

            const nextFeatureContextName = nextFlow === 'impl' ? item.name : `${item.name}_${nextFlow}`;

            contexts.push({
                ...contextToPush,
                name: nextFeatureContextName,
                variables: {
                    ...contextToPush.variables,
                    NEXT_FLOW: nextFlow,
                    PRD_FILE: prdFilePath,
                    TEST_PLAN_FILE: testPlanFilePath,
                }
            })

        }
        else if (itemType === 'documentation') {
            contexts.push(contextToPush);
        }
        else if (itemType === 'misc') {
            contexts.push(contextToPush);
        }
    }

    return contexts;
}

const lumpDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(lumpDir, '..', '..');
const lumpName = path.basename(lumpDir);


async function getFeatureNextFlow(item: TodoYamlItem) {
    if (item.type !== 'feature') return null;

    const prdFilePath = path.join(lumpDir, 'prds', `${item.name}.prd.md`);
    const hasPrd = await fileExists(prdFilePath);

    if (!hasPrd) return 'prd';

    const testPlanFilePath = path.join(lumpDir, 'testPlans', `${item.name}.test.md`);
    const hasTestPlan = await fileExists(testPlanFilePath);

    if (!hasTestPlan) return 'testPlan';

    const testsImplContextStatus = await getContextStatus({
        projectRoot,
        contextName: `${item.name}_tests_impl`,
        lumpName,
        baseBranch: 'v0.0.7',
    });

    if (testsImplContextStatus === 'toDo') return 'tests_impl';

    if (testsImplContextStatus === 'finished') return 'impl';

    if (testsImplContextStatus === 'branchPushed') return null;

    return 'impl';
}


export async function getContextListFn() {
    return loadPendingTodoContexts({ lumpDir, lumpName });
}

const getRecursiveStepsKeyIsValidSymbol = Symbol('getRecursiveStepsKeyIsValidSymbol');

export function getRecursiveSteps({
    maxIterations = 5,
    validationCommandFn = ({ context, contextRunState, stepIndex, currentIteration, prevValidateCommandResult, contextRunStateIsOkFlagKey }) => null as CommandDescriptor | null,
    isValidationCommandResultOk = ({ commandResult, contextRunState, stepIndex, currentIteration, commandSucceeded }) => !!commandSucceeded,
    getFirstSteps = ({ currentIteration, prevValidateCommandResult }) => [] as Steps,
    currentIteration = 0,
    prevValidateCommandResult = null as string | null,
    contextRunStateIsOkFlagKey = getRecursiveStepsKeyIsValidSymbol as any,
  }) {
    const firstSteps = getFirstSteps({ currentIteration, prevValidateCommandResult });
    let thisIterValidateCommandResult: string | null = null;
    return [
      ...firstSteps,
      {
        commandFn({ context, contextRunState, stepIndex }) {
          console.log('valid commandFn stepIndex', stepIndex);
          console.log('valid commandFn contextRunState', contextRunState);
          const stepIndexLen = Array.isArray(stepIndex) ? stepIndex.length : 1;
          if (stepIndexLen > maxIterations) {
            console.log('Loop limit reached');
            return {
              executable: 'echo',
              args: [
                'Loop limit reached',
              ],
            }
          }
          if (!contextRunState[contextRunStateIsOkFlagKey]) {
            return validationCommandFn({ context, contextRunState, stepIndex, currentIteration, prevValidateCommandResult, contextRunStateIsOkFlagKey }); 
          }
          return null;
        },
        postCommandExecFn({
          commandResult,
          contextRunState,
          commandSucceeded,
          stepIndex
        }) {
          console.log('postCommandExecFn commandResult', commandResult);
          console.log('postCommandExecFn stepIndex', stepIndex);
          console.log('postCommandExecFn contextRunState', contextRunState);
          thisIterValidateCommandResult = commandResult;
          contextRunState[contextRunStateIsOkFlagKey] = isValidationCommandResultOk({ commandResult, contextRunState, stepIndex, currentIteration, commandSucceeded });
          console.log('postCommandExecFn contextRunState', contextRunState);
        },
        continueOnError: currentIteration < maxIterations,
      },
      ({ contextRunState, stepIndex }) => {
        console.log('final step contextRunState', contextRunState);
        console.log('final step stepIndex', stepIndex);
        const stepIndexLen = Array.isArray(stepIndex) ? stepIndex.length : 1;
        const loopLimitReached = stepIndexLen > maxIterations;
        if (loopLimitReached) {
          console.log('Loop limit reached');
          return [];
        }
        return !contextRunState[contextRunStateIsOkFlagKey] ? getRecursiveSteps({
          maxIterations,
          validationCommandFn,
          isValidationCommandResultOk,
          getFirstSteps,
          currentIteration: currentIteration + 1,
          prevValidateCommandResult: thisIterValidateCommandResult,
          contextRunStateIsOkFlagKey,
        }) : [];
      }
    ] as Steps;
  }