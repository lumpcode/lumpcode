import {
    GitCommitMessageFn,
    GitPushCommandFn,
    GitAddCommandFn,
    GitCommitCommandFn,
    SetupWorkspaceFn,
    TeardownWorkspaceFn,
} from "../../types";
import { shellSingleQuote } from "../../utils";

export const defaultGitCommitMessageFn: GitCommitMessageFn = ({ context }) => {
    return `LUMP:${context.name}`;
};

export const defaultGitPushCommandFn: GitPushCommandFn = (input) => {
    return `git push origin ${shellSingleQuote(input.branchName)}`;
};

export const defaultGitAddCommandFn: GitAddCommandFn = () => {
    return `git add .`;
};

export const defaultGitCommitCommandFn: GitCommitCommandFn = (input) => {
    return `git commit --allow-empty -m ${shellSingleQuote(input.commitMessage)}`;
};

export const defaultSetupWorkspaceFn: SetupWorkspaceFn = async (input) => {
    const { baseBranch, branchName } = input;

    return {
        command: `
        git switch ${baseBranch};
        git reset --hard origin/${baseBranch};
        git fetch --all;
        git pull origin ${baseBranch};
        git branch -D ${branchName};
        git switch -c ${branchName};
        `,
        workspacePath: '.',
    };
};

export const defaultTeardownWorkspaceFn: TeardownWorkspaceFn = async (input) => {
    const { baseBranch } = input;
    return `git switch ${baseBranch}`;
};

export const defaultTeardownWorkspaceFnWithWorktree: TeardownWorkspaceFn = async (input) => {
    return "";
};

export const defaultSetupWorkspaceFnWithWorktree: SetupWorkspaceFn = async (input) => {
    const { baseBranch, branchName } = input;
    const worktreePath = `lump-wkt/${branchName}`;

    return {
        command: `git switch ${baseBranch} &&
        git pull origin ${baseBranch} &&
        git worktree remove ${worktreePath}  &&
        git branch -D ${branchName} &&
        git push --delete origin ${branchName} &&
        git worktree add -b ${branchName} ${worktreePath}`,
        workspacePath: worktreePath,
    };
};
