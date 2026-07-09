import path from 'path';
import { getContextStatus } from '@lumpcode/cli-utils';
import { pathExists } from '@lumpcode/core';

import { backlogPaths } from './backlogPaths';
import type { BacklogItem, FeatureFlow, BacklogPhaseMode } from './types';

export type GetNextFlowInput = {
    item: Pick<BacklogItem, 'name'> & Partial<Pick<BacklogItem, 'type'>>;
    lumpName: string;
    baseBranch: string;
    projectRoot: string;
    phaseMode: BacklogPhaseMode;
};

async function getFullFeatureNextFlow({
    item,
    lumpName,
    baseBranch,
    projectRoot,
}: Omit<GetNextFlowInput, 'phaseMode'>): Promise<FeatureFlow | null> {
    if (item.type !== 'feature') return null;

    const { prdDir, testPlanDir } = backlogPaths(lumpName);
    const prdFilePath = path.join(prdDir, `${item.name}.prd.md`);
    const hasPrd = await pathExists(prdFilePath);

    if (!hasPrd) return 'prd';

    const testPlanFilePath = path.join(testPlanDir, `${item.name}.test.md`);
    const hasTestPlan = await pathExists(testPlanFilePath);

    if (!hasTestPlan) return 'testPlan';

    const testsImplContextStatus = await getContextStatus({
        projectRoot,
        contextName: `${item.name}_tests_impl`,
        lumpName,
        baseBranch,
    });

    if (testsImplContextStatus === 'toDo') return 'tests_impl';

    if (testsImplContextStatus === 'finished') return 'impl';

    if (testsImplContextStatus === 'branchPushed') return null;

    return 'impl';
}

async function getPrdImplOnlyNextFlow({
    item,
    lumpName,
    baseBranch,
    projectRoot,
}: Pick<GetNextFlowInput, 'item' | 'lumpName' | 'baseBranch' | 'projectRoot'>): Promise<'impl' | null> {
    const { prdDir } = backlogPaths(lumpName);
    const prdFilePath = path.join(prdDir, `${item.name}.prd.md`);
    const hasPrd = await pathExists(prdFilePath);

    if (!hasPrd) return null;

    const implContextStatus = await getContextStatus({
        projectRoot,
        contextName: item.name,
        lumpName,
        baseBranch,
    });

    if (implContextStatus === 'branchPushed') return null;

    if (implContextStatus === 'finished') return null;

    return 'impl';
}

export async function getNextFlow({
    item,
    lumpName,
    baseBranch,
    projectRoot,
    phaseMode,
}: GetNextFlowInput): Promise<FeatureFlow | null> {
    if (phaseMode === 'prd-impl-only') {
        return getPrdImplOnlyNextFlow({ item, lumpName, baseBranch, projectRoot });
    }

    return getFullFeatureNextFlow({ item, lumpName, baseBranch, projectRoot });
}
