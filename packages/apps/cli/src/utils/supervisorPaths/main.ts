import * as path from 'node:path';

export type SupervisorMetaWrite = {
    projectRoot: string;
    startedAt: string;
};

export function supervisorDirPath(input: { globalConfigFolderPath: string }): string {
    return path.join(input.globalConfigFolderPath, 'supervisor');
}

export function supervisorPidPath(input: {
    globalConfigFolderPath: string;
    projectName: string;
}): string {
    return path.join(supervisorDirPath(input), `${input.projectName}.pid`);
}

export function supervisorLogPath(input: {
    globalConfigFolderPath: string;
    projectName: string;
}): string {
    return path.join(supervisorDirPath(input), `${input.projectName}.log`);
}

export function supervisorMetaPath(input: {
    globalConfigFolderPath: string;
    projectName: string;
}): string {
    return path.join(supervisorDirPath(input), `${input.projectName}.meta.json`);
}
