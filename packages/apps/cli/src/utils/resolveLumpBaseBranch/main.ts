import type { LocalConfig } from '../../types/LocalConfig';
import { resolvePrimaryProjectBaseBranch } from '../resolveProjectBaseBranches';

export function resolveLumpBaseBranch(input: {
    baseBranch?: string;
    localConfig: LocalConfig;
}): string {
    return input.baseBranch ?? resolvePrimaryProjectBaseBranch(input.localConfig);
}
