import { isAbsolute, join } from 'node:path';

export function resolveCursorConfigDir({ agentPermissions, projectRoot }) {
    const cursorConfigDir = agentPermissions?.cursorConfigDir;
    if (cursorConfigDir == null || cursorConfigDir === '') {
        return undefined;
    }
    return isAbsolute(cursorConfigDir) ? cursorConfigDir : join(projectRoot, cursorConfigDir);
}
