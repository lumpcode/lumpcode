import path from "node:path";

import { getFirstExistingPath } from "../getFirstExistingPath";

export async function getCommandPath(
    command: string,
    params: { localConfigFolderPath: string; globalConfigFolderPath: string },
) {
    return getFirstExistingPath([
        path.join(params.localConfigFolderPath, 'commands', command + '.js'),
        path.join(params.globalConfigFolderPath, 'commands', command + '.js'),
        path.join(params.globalConfigFolderPath, 'commands', 'presets', command + '.js'),
    ]);
}