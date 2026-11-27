# Memo: agent session registry

Idea notes from the `workflow-api-agent-sessions` review (2026-11-27). Not a contract: `requirements.md` still has to be grilled.

## Why

- **No cleanup today.** Every built-in preset's `teardown` is a no-op, so each session a context run creates stays on the worker forever. On one dev machine: Cursor 3.3 GB in `~/.cursor/chats` (334 workspace folders, 914 chats, one folder per workspace path, so it grows with every worktree), Copilot 350 MB, Claude Code 184 MB, OpenCode 43 MB, Codex 1 MB. A daemon VM running for weeks will fill its disk.
- **No way back to a session.** A session lives only as long as its context run. Getting back to one later, from a workflow or by hand, needs a name or id that Lumpcode keeps.
- **Leftovers cannot be told apart** from the operator's own agent sessions without a record of what Lumpcode created.

## The idea

One registry on the worker records every session Lumpcode creates, global or not.

1. **Global sessions.** Created or retrieved by a friendly name, or by a generated id when no name is given. Long lived. Sketch: `lumpcode session open <name> --command cursor`; in a workflow, something like `agent.session({ global: 'reviewer' })`.
2. **Delete a global session** by friendly name or id: `lumpcode session delete <name|id>`. Removes the registry entry and the agent's own data.
3. **Retention for non-global sessions.** A lump option decides how long they live, e.g. `agentSessionRetention: 'context' | '7d' | 'keep'`.
4. **Lumpcode ids for non-global sessions.** Non-global sessions cannot have friendly names. Each gets an id like `${lumpName}-${contextName}-${commandName}-${timestamp}`. Commands: `session list` (filter by lump or context), `session show <id>` (prints the agent's real session id), `session resume <id>` (opens the agent interactively on that session).
5. **Later: dashboard chat.** Reopen a global or non-global session from the dashboard and chat with it (`dashboard-v2`): each message is one prompt that resumes the session by id.

## What each agent offers

Checked against the CLIs installed on 2026-11-27.

| Preset | Session id | Name support | Delete |
| --- | --- | --- | --- |
| `claude-code` | UUID we pick (`--session-id`) | `-n, --name`; `-r, --resume <id or name>` | no per-session command; `claude purge <path>` deletes one project folder's data, or remove `~/.claude/projects/<encoded cwd>/<id>.jsonl` |
| `copilot` | UUID we pick (`--session-id`) | `-n, --name`; `-r <name>` (exact, case-insensitive) | none; remove the folder under `~/.copilot/session-state/` |
| `codex` | generated `thread_id` | resume by thread name, but `codex exec` cannot set one | `codex delete <id>` |
| `opencode` | generated | `run --title` sets a title; `-s` takes an id only | `opencode session delete <id>` |
| `cursor` | generated (`create-chat`) | none | none; remove `~/.cursor/chats/<workspace hash>/<chatId>/` |

Conclusion: agent-side names are labels, not unique keys, and only two presets support them. Lumpcode keeps the name → real id mapping itself. Presets may still pass the name as a display label where the agent supports one (`-n`, `--title`) so the agents' own pickers stay readable.

## Shape so far

- Registry: JSON under `~/.lumpcode/` with one record per session: `{ lumpcodeId, name?, global, command, sessionId, cwd, lump?, context?, createdAt, expiresAt? }`. Writes take a lock (parallel lump lines share it).
- New optional preset export `deleteSession({ sessionId, workspacePath, lumpVariables })` for the five built-in presets. Custom presets without it behave as today.
- Workflow sessions (`createCliAgent`) and steps chats (`contextRunState.<preset>Setup.chatsIds`) both register what they create.

## Open questions for the grill

1. **Who sweeps expired sessions?** A duration retention does nothing without a sweep. Candidates: the start of every `lumpcode run`, the daemon loop, a `session prune` command.
2. **Working directory.** Claude Code stores sessions per project folder, Cursor per workspace hash. Does a session resume from another folder? Does a global session follow work across contexts or only suit advisor-type roles? `resume` needs the original `cwd`, and that worktree may be gone. Test each agent before deciding.
3. **Id format.** Two sessions in the same millisecond collide (add a counter or a random suffix). Context names can hold `/` and be long, so ids need cleaning up.
4. **Name scope.** Unique per project on a worker, or per worker.
5. **Concurrency.** Two contexts using one global session at once interleave turns in one chat: lock per session, or document it.
6. **Default retention.** Deleting at context end by default changes today's behavior; the Lumpcode transcript already keeps a copy of each run.
7. **Worker-local by nature.** The registry is not a status store, and the agents' transcripts exist only on that disk. The docs must say that global sessions do not move between workers.
8. **Dashboard chat security.** It runs an agent on the worker from a browser: behind the password login, with the session's permissions.

## Possible tickets

1. Registry, `deleteSession`, retention and sweep (the most urgent, for disk use).
2. Lumpcode ids, `session list` / `show` / `resume`.
3. Global sessions: `session open` / `delete`, the workflow API option.
4. Dashboard chat (with `dashboard-v2`).
