import {
    FEATURE_BACKLOG_RESERVED_NAME_SUFFIXES,
    FEATURE_BACKLOG_WORKFLOW_STAGES,
    WORKFLOW_PREFIX_ORDER,
    type FeatureBacklogTerminalStage,
    type FeatureBacklogWorkflow,
    type FeatureBacklogWorkflowStage,
} from './types';

let warnedManualReq = false;
let warnedReqAndManualReq = false;

function warnManualReqDeprecated(): void {
    if (warnedManualReq) {
        return;
    }
    warnedManualReq = true;
    console.warn(
        '[lumpcode/recipes] featureBacklog: desc.yml field "manualReq" is deprecated and ignored. ' +
            'Put "manualReq" in workflow to wait for a human requirements file, ' +
            'or set manual: true to skip the item.',
    );
}

function warnReqAndManualReq(itemName: string, field: 'stages' | 'workflow'): void {
    if (warnedReqAndManualReq) {
        return;
    }
    warnedReqAndManualReq = true;
    console.warn(
        `[lumpcode/recipes] featureBacklog: backlog item "${itemName}" field "${field}" contains both ` +
            '"req" and "manualReq"; using "manualReq".',
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
    let normalized: FeatureBacklogWorkflowStage[] = [];
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
    if (normalized.includes('req') && normalized.includes('manualReq')) {
        normalized = normalized.filter((stage) => stage !== 'req');
    }
    return normalized;
}

function asDescRecord(raw: unknown): Record<string, unknown> | undefined {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return undefined;
    }
    return raw as Record<string, unknown>;
}

function parseStageList(
    itemName: string,
    field: 'stages' | 'workflow',
    value: unknown,
): FeatureBacklogWorkflow {
    if (!Array.isArray(value)) {
        throw new Error(
            `Backlog item "${itemName}" field "${field}" must be an array of stages: ${FEATURE_BACKLOG_WORKFLOW_STAGES.join(', ')}`,
        );
    }
    if (value.length !== new Set(value).size) {
        throw new Error(`Backlog item "${itemName}" field "${field}" must not contain duplicate stages`);
    }
    const stages: FeatureBacklogWorkflowStage[] = [];
    for (const entry of value) {
        if (!isWorkflowStage(entry)) {
            throw new Error(
                `Backlog item "${itemName}" field "${field}" contains unknown stage ${JSON.stringify(entry)}`,
            );
        }
        stages.push(entry);
    }
    if (stages.includes('req') && stages.includes('manualReq')) {
        warnReqAndManualReq(itemName, field);
    }
    return normalizeWorkflow(stages);
}

/** Steps recipe: reads `desc.yml` `workflow` only. */
export function parseFeatureWorkflow(itemName: string, raw: unknown): FeatureBacklogWorkflow | undefined {
    const record = asDescRecord(raw);
    if (record === undefined) {
        return undefined;
    }
    if ('manualReq' in record) {
        warnManualReqDeprecated();
    }
    if (record.workflow === undefined) {
        return undefined;
    }
    return parseStageList(itemName, 'workflow', record.workflow);
}

/**
 * Workflow recipe: reads `stages`. `workflow` is a deprecated alias.
 * Warns once per call when only the alias is set. Both fields throw.
 */
export function parseFeatureStages(itemName: string, raw: unknown): FeatureBacklogWorkflow | undefined {
    const record = asDescRecord(raw);
    if (record === undefined) {
        return undefined;
    }
    if ('manualReq' in record) {
        warnManualReqDeprecated();
    }
    const hasStages = record.stages !== undefined;
    const hasWorkflow = record.workflow !== undefined;
    if (hasStages && hasWorkflow) {
        throw new Error(`${itemName}: use "stages" only ("workflow" is its deprecated name).`);
    }
    if (!hasStages && !hasWorkflow) {
        return undefined;
    }
    if (hasWorkflow) {
        console.warn(`${itemName}: "workflow" is deprecated in desc.yml; rename it to "stages".`);
    }
    const field = hasStages ? 'stages' : 'workflow';
    return parseStageList(itemName, field, record[field]);
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
