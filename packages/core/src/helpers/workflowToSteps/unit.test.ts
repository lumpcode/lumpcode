import { describe, expect, it } from 'vitest';

import type { WorkflowFn } from '../../types';
import * as core from '../../index';
import { workflowToSteps } from './main';

describe('workflowToSteps', () => {
    it('returns one internal workflow step and does not run the function', () => {
        let ran = false;
        const workflow: WorkflowFn = async () => {
            ran = true;
        };

        const steps = workflowToSteps(workflow);

        expect(ran).toBe(false);
        expect(steps).toHaveLength(1);
        expect(steps[0]).toMatchObject({ kind: 'workflow', workflowFn: workflow });
        expect(steps[0]?.timeoutMillis).toBeUndefined();
        expect(steps[0]).not.toHaveProperty('promptFn');
        expect(steps[0]).not.toHaveProperty('commandFn');
    });

    it('carries timeoutMillis onto that step', () => {
        const workflow: WorkflowFn = async () => undefined;
        const steps = workflowToSteps(workflow, 1234);

        expect(steps).toEqual([
            { kind: 'workflow', workflowFn: workflow, timeoutMillis: 1234 },
        ]);
    });

    it('is not a public package export', () => {
        expect(core).not.toHaveProperty('workflowToSteps');
        expect(core).not.toHaveProperty('createWorkflowRuntime');
        expect(core).not.toHaveProperty('workflowFn');
        expect(core).not.toHaveProperty('WorkflowStep');
    });
});
