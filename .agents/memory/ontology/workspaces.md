# Workspaces

Three folders a run can involve:

- **Project workspace** (`projectRoot`): the checkout that holds `.lumpcode/`.
- **Execution workspace** (`executionWorkspacePath`, CLI only): the git repo root Lumpcode runs in after pre-flight. Same folder as the project workspace in both modes.
- **Branch workspace** (`workspacePath` on core `CommandFn` / `SetupWorkspaceFn`): where the agent runs and per-context git happens. Shared: the current checkout. Dedicated `checkout`: the execution workspace. Dedicated `worktree`: `.lumpcode/worktrees/<branch>/`.

Rules: `domain/workspaces.md`, `domain/locks.md`.
