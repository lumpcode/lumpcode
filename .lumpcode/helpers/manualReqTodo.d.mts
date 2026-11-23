export function descYamlHasManualReq(raw: string): boolean;
export function readDescYamlHasManualReq(descPath: string): Promise<boolean>;
export function itemNeedsAutoTriageRequirements(itemDir: string): Promise<boolean>;
export function findTouchedManualReqTodos(projectRoot: string): Promise<string[]>;
