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

When unblocked ideas exist (and not every lane is over the soft cap of 3 todos), the lump launches a Cursor cloud agent on `lump/ideasToBacklog/YYYY-MM-DD`. Continue in Cursor Agents: promote / reject / park / spawn. Promotes create a `desc.yml` in one of:

```text
.lumpcode/lumps/backlog/backlogItems/todo/<name>/   # big features
.lumpcode/lumps/docs/backlogItems/todo/<name>/      # docs, naming, SEO
.lumpcode/lumps/qol/backlogItems/todo/<name>/       # small quality-of-life
.lumpcode/lumps/bugfixes/backlogItems/todo/<name>/  # bugs
```

## 3. Worker: delivery daemons

```bash
lumpcode start \
  --exclude=ideasToBacklog \
  --daemonId=global \
  --maxParallelRun 2
```

Four independent lumps: `backlog` (features), `docs`, `qol`, `bugfixes`. Global picks them all up.

## 4. What a `featureBacklog` lump does each tick

`backlog`, `qol`, and `bugfixes` share this shape. Discovery: `dev` + `feature/*`.

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
lumpcode lump-status --lumpName docs
# Review PR → merge
```

Next tick continues. Ideas in, PRs out.
