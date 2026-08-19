import { execSync } from 'node:child_process';

import type { BranchFn, CommandFn, Logger, Steps } from '../../../types';
import { success } from '../../../utils';

export const stubBranchFn: BranchFn = async () => 'lump/test/ctx';
export const stubGitAddCommit = () => success('echo git-add-commit');
export const stubGitPush = () => success('echo git-push');
export const stubGitCommitMessage = () => 'LUMP:ctx';
export const echoCommandFn: CommandFn = () => ({ executable: 'echo', args: ['ok'] });

export function initTestGitRepo(projectRoot: string) {
    execSync(
        'git init && git config user.email "test@test.com" && git config user.name "Test" && git commit --allow-empty -m "init"',
        { cwd: projectRoot, stdio: 'pipe' },
    );
}

export function makeSteps(prompts: string[]): Steps {
    return prompts.map((promptTemplate) => ({
        promptFn: () => promptTemplate,
        commandFn: echoCommandFn,
    }));
}

export function recordingGitFns(events: string[]) {
    return {
        gitAddCommitFn: () => {
            events.push('gitAddCommit');
            return success('echo git-add-commit');
        },
        gitPushFn: () => {
            events.push('gitPush');
            return success('echo git-push');
        },
    };
}

export function recordingTeardownAndGit(events: string[]) {
    return {
        ...recordingGitFns(events),
        teardownFn: async () => {
            events.push('teardownFn');
        },
        teardownWorkspaceFn: async () => {
            events.push('teardownWorkspaceFn');
            return '';
        },
    };
}

export function capturingLogger(errorCalls: string[]): Logger {
    const logger: Logger = {
        error: (message: string) => {
            errorCalls.push(message);
        },
        warn: () => {},
        info: () => {},
        verbose: () => {},
        child: () => logger,
    };
    return logger;
}
