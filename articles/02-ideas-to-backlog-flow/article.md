# Ideas → backlog → merged code (our Lumpcode loop)

How we run Lumpcode on Lumpcode: capture ideas, triage daily, then stage delivery.

## 1. Capture ideas (any machine)

Edit root `IDEAS.yaml`:

```yaml
- name: daemon-primary-branch-refresh
  task: Add a command to refresh primary branches on the daemon
  priority: 1
```

`blocked: "…"` parks an idea. Lower `priority` = sooner.

## 2. Worker: ideas triage daemon (daily)

On the dedicated worker, with `CURSOR_API_KEY` set (env or `.env`):

```bash
export CURSOR_API_KEY=...

lumpcode start \
  --include=ideasToBacklog \
  --daemonId=ideas \
  --cronSetup '0 9 * * *'
```

When unblocked ideas exist (and backlog todos aren’t over the soft cap), the lump launches a Cursor cloud agent on `lump/ideasToBacklog/YYYY-MM-DD`. Continue in Cursor Agents: promote / reject / park / spawn. Promotes create:

```text
.lumpcode/lumps/backlog/backlogItems/todo/<name>/desc.yml
```

## 3. Worker: main backlog daemon

```bash
lumpcode start \
  --exclude=ideasToBacklog \
  --daemonId=global \
  --maxParallelRun 2
```

## 4. What the `backlog` lump does each tick

Discovery: `dev` + `feature/*`.

| Branch | What runs |
| --- | --- |
| `dev` | Top-level items whose `workflow` has no `testPlan`/`testImpl` |
| `feature/<itemName>` | That item’s campaign stages |

Default stages (omit `workflow`, each is a context → branch → agent → push):

1. `req` → write `requirements.md`
2. `testPlan` → write `testPlan.md`
3. `testImpl` → add skipped tests
4. `impl` → implement, unskip, build+test until green → move to `completed/`

Or set `workflow: [req]` in `desc.yml` for req → implement on `dev`.

## 5. Human side

```bash
# From your workstation (shared mode)
git fetch
lumpcode lump-status --lumpName backlog
# Review PR → merge
```

Next tick continues. Ideas in, PRs out.
