# Requirements: Create-only `scaffoldLumpcodeProject`

| Field | Value |
| --- | --- |
| **Backlog** | `scaffold-lumpcode-project` · priority **0** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary: `@lumpcode/cli` (`utils/scaffoldLumpcodeProject`, `utils/getProjectName`, `commands/project-setup`). Website / recipes / core / `cli-types` / `cli-utils` unchanged. |

## Problem statement and motivation

`project-setup` owns mkdir, `project.json`, `local.json`, and gitignore inline. `setup` needs the same create path plus optional `workspaceStrategy` / `maxParallelRun`, without a second write implementation.

1. Two commands would duplicate the same FS writes.
2. Name infer (`origin` URL or basename → `sanitizeInferredProjectName`) lives only inside `project-setup`.

## Goals

1. One create-only util writes a fresh `.lumpcode/` tree from caller-supplied configs.
2. `project-setup` is a thin flag wrap over that util and still fails when `.lumpcode/` exists.
3. Project-name infer-or-flag lives in `getProjectName` and is called by `project-setup` (later by `setup`).

## Non-goals

- Resume / merge when `.lumpcode/` exists (that is `setup`).
- Changing `project-setup` flags or defaults (`mode` default `shared`, omitted `primaryBranch` still `main`).
- Writing `command`, `keepHistory`, `verbose`, `refreshCommand`, `disabled`, or `primaryBranches`.
- Registering `lumpcode setup`.
- Docs beyond existing `project-setup` behavior (unchanged).

## User stories / use cases

1. As an operator — I run `lumpcode project-setup --mode shared` in a git repo with no `.lumpcode/`, so I get the same files as today.
2. As an operator — I run `project-setup` again, so it still fails because the tree exists.
3. As `setup` (later) — I pass mode plus optional strategy / `maxParallelRun` into the same util, so I do not reimplement mkdir/write/gitignore.

## Proposed behavior and UX

`project-setup` CLI, messages, and refuse-if-exists behavior stay as they are.

### `resolveInferredProjectName` (owner: `getProjectName`)

```ts
resolveInferredProjectName({
  projectRoot: string;
  explicitName?: string;
}) → Success<string> | Failure<string>
```

- Non-empty `explicitName`: validate with `isValidProjectName`; else the existing invalid-name message.
- Else: `git remote get-url origin` → `rawRepoSegmentFromRemoteUrl`, else `path.basename(projectRoot)` → `sanitizeInferredProjectName`. Unusable result → the existing “Pass `--projectName`…” failure.
- `getProjectName({ localConfigFolderPath, projectRoot })` (read `project.json`) is unchanged.

`project-setup` and later `setup` call this helper. They do not re-copy the infer dance.

### `scaffoldLumpcodeProject`

Owner: `packages/apps/cli/src/utils/scaffoldLumpcodeProject/` (barrel-export from `utils/index.ts`).

```ts
scaffoldLumpcodeProject({
  projectRoot: string;
  project: { projectName: string; primaryBranch: string };
  local: { mode: 'shared' | 'dedicated'; workspaceStrategy?: 'checkout' | 'worktree'; maxParallelRun?: number };
}) → Success<{ lumpcodeDir: string }> | Failure<string>
```

| Rule | Contract |
| --- | --- |
| Exists | If `.lumpcode/` exists → Failure (same idea as today’s `project-setup` message). |
| Dirs | Create `.lumpcode/lumps/` and `.lumpcode/commands/`. |
| `project.json` | Write caller `project` (`pretty`, trailing newline). |
| `local.json` | Write `mode`. Include `workspaceStrategy` only when the caller passed it. Include `maxParallelRun` only when the caller passed a value other than `1`. |
| gitignore | `appendMissingGitignoreLines` with the same five lines `project-setup` uses today. |

`project-setup` passes `{ mode }` only (no strategy / `maxParallelRun` keys). Fresh `setup` may pass those later. No other command implements this create path.

## Technical approach

| Step | Where | Contract |
| --- | --- | --- |
| 1 | `utils/getProjectName/` | Add `resolveInferredProjectName`. Keep `sanitizeInferredProjectName`, `rawRepoSegmentFromRemoteUrl`, `isValidProjectName`, `getProjectName`. |
| 2 | `utils/scaffoldLumpcodeProject/` | Create-only owner as above. |
| 3 | `commands/project-setup/` | Resolve root + git work-tree + name + defaults, then call the util. Delete the inline mkdir/write/gitignore body. |

## Testing strategy

| Level | Host | Expect |
| --- | --- | --- |
| Unit | `getProjectName/unit.test.ts` | Flag name, origin infer, basename infer, invalid name. |
| Unit | `scaffoldLumpcodeProject/unit.test.ts` | Fresh write; second call fails; optional strategy / `maxParallelRun` omitted vs written. |
| Unit | `commands/project-setup/unit.test.ts` | Existing scaffold cases still pass (mode-only `local.json`, `primaryBranch` on project, refuse existing tree). |

No E2E change required if existing `project-setup` e2e still passes.

## Acceptance criteria

1. `project-setup` on a clean git repo writes the same files and gitignore lines as before.
2. `project-setup` on an existing `.lumpcode/` still fails.
3. `project-setup` `local.json` is still `{ "mode": … }` only.
4. No second create implementation outside `scaffoldLumpcodeProject`.
5. Name infer has one owner in `getProjectName`; `project-setup` does not keep a private copy.
