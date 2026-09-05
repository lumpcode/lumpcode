import {
    DEFAULT_ITEM_DISCOVERY_BRANCH_PREFIX,
    DEFAULT_PRIMARY_DISCOVERY_BRANCH,
    type FeatureBacklogWorkflow,
} from './types';

function assertDiscoveryToken(value: string, field: string): void {
    if (value.length === 0 || /\s/.test(value) || value.includes('*') || value.endsWith('/')) {
        throw new Error(
            `featureBacklog ${field} must be a non-empty exact name without whitespace, *, or a trailing /`,
        );
    }
}

export function resolveFeatureBacklogDiscoveryOptions(options: {
    primaryDiscoveryBranch?: string;
    itemDiscoveryBranchPrefix?: string;
}): {
    primaryDiscoveryBranch: string;
    itemDiscoveryBranchPrefix: string;
} {
    const primaryDiscoveryBranch =
        options.primaryDiscoveryBranch ?? DEFAULT_PRIMARY_DISCOVERY_BRANCH;
    const itemDiscoveryBranchPrefix =
        options.itemDiscoveryBranchPrefix ?? DEFAULT_ITEM_DISCOVERY_BRANCH_PREFIX;
    assertDiscoveryToken(primaryDiscoveryBranch, 'primaryDiscoveryBranch');
    assertDiscoveryToken(itemDiscoveryBranchPrefix, 'itemDiscoveryBranchPrefix');
    return { primaryDiscoveryBranch, itemDiscoveryBranchPrefix };
}

function campaignBranchPrefix(itemDiscoveryBranchPrefix: string): string {
    return `${itemDiscoveryBranchPrefix}/`;
}

function workflowHasCampaignStages(workflow: FeatureBacklogWorkflow): boolean {
    return workflow.includes('testPlan') || workflow.includes('testImpl');
}

export function classifyDiscoveryScan(
    discoveryBranch: string,
    primaryDiscoveryBranch: string,
    itemDiscoveryBranchPrefix: string,
): 'primary' | 'itemCampaign' | 'unmatched' {
    if (discoveryBranch === primaryDiscoveryBranch) {
        return 'primary';
    }
    if (discoveryBranch.startsWith(campaignBranchPrefix(itemDiscoveryBranchPrefix))) {
        return 'itemCampaign';
    }
    return 'unmatched';
}

export function itemNameFromCampaignBranch(
    discoveryBranch: string,
    itemDiscoveryBranchPrefix: string,
): string {
    return discoveryBranch.slice(campaignBranchPrefix(itemDiscoveryBranchPrefix).length);
}

export function itemIsEligibleForDiscoveryScan(input: {
    itemName: string;
    parentName?: string;
    discoveryBranch: string;
    workflow: FeatureBacklogWorkflow;
    primaryDiscoveryBranch: string;
    itemDiscoveryBranchPrefix: string;
}): boolean {
    const kind = classifyDiscoveryScan(
        input.discoveryBranch,
        input.primaryDiscoveryBranch,
        input.itemDiscoveryBranchPrefix,
    );
    switch (kind) {
        case 'primary':
            return input.parentName === undefined && !workflowHasCampaignStages(input.workflow);
        case 'itemCampaign': {
            const campaignItemName = itemNameFromCampaignBranch(
                input.discoveryBranch,
                input.itemDiscoveryBranchPrefix,
            );
            return (input.parentName ?? input.itemName) === campaignItemName;
        }
        case 'unmatched':
            return false;
        default: {
            const _exhaustive: never = kind;
            return _exhaustive;
        }
    }
}
