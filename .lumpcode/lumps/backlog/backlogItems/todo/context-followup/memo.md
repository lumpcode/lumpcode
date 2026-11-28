# Memo: context follow-up

Idea notes from the `agent-session-registry` discussion (2026-11-28). Not a contract: `requirements.md` still has to be grilled.

## Why

A context's work does not end at `git push`. Review comments, failed CI on the PR, and requested changes all land on the pushed branch. Today an operator handles them by hand or starts a new lump that knows nothing about the original run. The agent session that wrote the code, its prompts and the lump's own variables are lost.

## The idea

A `followup` hook next to `workflow`. It runs once the context is `branchPushed`, stays active until the context is `finished` (or the branch is gone), and gets what the workflow returned.

```ts
export default defineLump({
  getContextListFn,
  async workflow({ context, agent, shell }) {
    const session = await agent.session();
    await session.prompt(`Implement ${context.name}`);
    const green = await retryUntilGreen({ session, shell, check: 'npm run test', maxAttempts: 3 });
    return {
      succeeded: green.succeeded,
      message: green.succeeded ? 'Implemented, tests green.' : 'Tests still red after 3 attempts.',
      variables: { implSessionId: session.sessionId },
    };
  },
  async followup({ context, agent, shell, workflowRes }) {
    const github = gitClient('github');                // recipe kit, not the CLI
    const session = (await agent.resume(workflowRes.variables.implSessionId)) ?? (await agent.session());
    const listener = github.listenContextComments(context, async (comment) => {
      await session.prompt(`Address this review comment: ${comment.body}`);
    });
    return () => listener.stop();
  },
});
```

The workflow names the session that wrote the code (`implSessionId`), so nothing has to infer it from marker commits or timestamps.

## Persistence

`followup` is code in the lump config and cannot be serialized. Its inputs can, and that is all a restart needs.

- **`workflowRes` is plain data.** No functions, class instances or handles: JSON-serializable only (`succeeded`, `push`, `message`, `variables`). Validate it when the workflow returns, not when a follow-up is restored, so the error points at the workflow.
- **Record.** Worker-local, next to the session registry (e.g. `~/.lumpcode/followups.json`), one per context: `{ lump, context, branch, workflowRes, startedAt, handledEventIds? }`. Writes take the registry's lock.
- **Restore.** On daemon start, load each lump config again and call `followup(savedInputs)`. The listener is a new closure built from the same data.
- **Git wins.** The record is a job record, not a status store. On start and on each tick, drop records whose context is `finished` (marker is an ancestor of `origin/<baseBranch>`) or whose branch no longer exists on the remote, and call the stop function of any running follow-up for them.
- **Current config.** A restored follow-up runs the lump's current `followup` code, not the code from when the context ran. The docs must say so.

## Open questions for the grill

1. **Host.** Only the daemon outlives a run. Does `lumpcode run` start follow-ups at all (in-process until exit), or only record them for the daemon? What does a lump with `followup` do on a worker with no daemon?
2. **Hook shape.** A free-form listener plus stop function (above) or a declarative `{ source, handle(event) }` where Lumpcode owns polling, queuing and lifecycle and `handle` returns `succeeded` / `push` / `message` like `workflow`. The second makes items 3 to 5 Lumpcode's job instead of every lump author's.
3. **Workspace.** The run's worktree is gone after push. Each event needs a workspace checked out on the pushed branch, the git lock, setup and teardown hooks, then a commit and push to the same branch. Overlaps `reuse-existing-lump-branch`.
4. **One event at a time per context.** Two comments arriving together must not interleave turns in one session. Queue per context; decide whether different contexts run in parallel and how they count against the daemon's lump lines.
5. **Handled twice.** A restored listener sees old events again. Keep handled ids in the record (simple, worker-local) or a `Lumpcode-Event: <id>` trailer in each fix commit (survives a worker change). Pick one.
6. **Session lifetime.** A session that `workflowRes.variables` points to must outlive the context run. A retention value such as `'untilFinished'` in `agent-session-registry` fits exactly. `agent.resume` returns "not found" when the session is gone (other worker, expired, worktree path changed) and the follow-up falls back to a new session.
7. **Sources.** First source: review comments on the pushed branch via `gh` in the recipe kit. Later: CI status, PR-level comments (no commit attached: which context on a multi-context branch?). One poller per lump, not per context, for API rate limits.
8. **Reporting.** Where an event's result shows: a reply on the comment (kit), the transcript, the dashboard. Does a failed event change anything visible in `lumpcode status`?
9. **Steps lumps.** Workflow lumps only, or a steps equivalent later?
10. **Worker-local.** Follow-ups and their sessions stay on the worker that ran the context. Say so in the docs, as for global sessions.

## Possible tickets

1. Serializable `workflowRes` validation and the follow-up record with restore and git reconciliation in the daemon.
2. The `followup` hook (shape from question 2), the workspace on the pushed branch, the per-context queue, handled-event markers.
3. Recipe kit source: GitHub review comments (`gh`), reply on handled comments.
