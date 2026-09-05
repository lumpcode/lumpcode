import {
    FEATURE_BACKLOG_RESERVED_NAME_SUFFIXES,
    FEATURE_BACKLOG_WORKFLOW_STAGES,
    WORKFLOW_PREFIX_ORDER,
    type FeatureBacklogTerminalStage,
    type FeatureBacklogWorkflow,
    type FeatureBacklogWorkflowStage,
} from './types';

let warnedManualReq = false;

function warnManualReqDeprecated(): void {
    if (warnedManualReq) {
        return;
    }
    warnedManualReq = true;
    console.warn(
        '[lumpcode/recipes] featureBacklog: desc.yml field "manualReq" is deprecated and ignored. ' +
            'Omit "req" from workflow to wait for a human requirements file, or set manual: true to skip the item.',
    );
}

export function assertValidFeatureItemName(name: string): void {
    for (const suffix of FEATURE_BACKLOG_RESERVED_NAME_SUFFIXES) {
        if (name.endsWith(suffix)) {
            throw new Error(`Backlog item name must not end with reserved suffix ${suffix}: ${name}`);
        }
    }
}

function isWorkflowStage(value: unknown): value is FeatureBacklogWorkflowStage {
    return (
        typeof value === 'string' &&
        (FEATURE_BACKLOG_WORKFLOW_STAGES as readonly string[]).includes(value)
    );
}

function normalizeWorkflow(stages: FeatureBacklogWorkflowStage[]): FeatureBacklogWorkflow {
    const unique = new Set(stages);
    const normalized: FeatureBacklogWorkflowStage[] = [];
    for (const stage of WORKFLOW_PREFIX_ORDER) {
        if (unique.has(stage)) {
            normalized.push(stage);
        }
    }
    if (unique.has('directImpl')) {
        normalized.push('directImpl');
    } else if (unique.has('impl')) {
        normalized.push('impl');
    }
    return normalized;
}

export function parseFeatureWorkflow(itemName: string, raw: unknown): FeatureBacklogWorkflow | undefined {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return undefined;
    }
    const record = raw as Record<string, unknown>;
    if ('manualReq' in record) {
        warnManualReqDeprecated();
    }
    if (record.workflow === undefined) {
        return undefined;
    }
    if (!Array.isArray(record.workflow)) {
        throw new Error(
            `Backlog item "${itemName}" field "workflow" must be an array of stages: ${FEATURE_BACKLOG_WORKFLOW_STAGES.join(', ')}`,
        );
    }
    if (record.workflow.length !== new Set(record.workflow).size) {
        throw new Error(`Backlog item "${itemName}" field "workflow" must not contain duplicate stages`);
    }
    const stages: FeatureBacklogWorkflowStage[] = [];
    for (const entry of record.workflow) {
        if (!isWorkflowStage(entry)) {
            throw new Error(
                `Backlog item "${itemName}" field "workflow" contains unknown stage ${JSON.stringify(entry)}`,
            );
        }
        stages.push(entry);
    }
    return normalizeWorkflow(stages);
}

export function parseManual(itemName: string, raw: Record<string, unknown>): boolean | undefined {
    if (raw.manual === undefined) {
        return undefined;
    }
    if (typeof raw.manual !== 'boolean') {
        throw new Error(`Backlog item "${itemName}" field "manual" must be a boolean`);
    }
    return raw.manual === true ? true : undefined;
}

export function resolveTerminal(workflow: FeatureBacklogWorkflow): FeatureBacklogTerminalStage {
    if (workflow.includes('directImpl')) {
        return 'directImpl';
    }
    return 'impl';
}

export function parentNameFromTodoRelativeDir(todoRelativeDir: string): string | undefined {
    const parts = todoRelativeDir.split('/');
    if (parts.length === 3 && parts[1] === 'tickets') {
        return parts[0];
    }
    return undefined;
}
