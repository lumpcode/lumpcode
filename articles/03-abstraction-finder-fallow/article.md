# Find abstractions with fallow + `abstractionFinder`

Turn duplicated CLI logic into a backlog pipeline.

## 1. Prerequisites on the worker

Lumps already live at:

- `.lumpcode/lumps/abstractionFinder/` — finds one util candidate
- `.lumpcode/lumps/abstractionImplementer/` — implements it

`fallow` is invoked inside the finder steps (`npx fallow …`).

## 2. Run the finder once (optional smoke test)

```bash
lumpcode run abstractionFinder
```

What that run does, in order:

1. **Fallow scan** (semantic dupes for `@lumpcode/cli`):

```bash
npx fallow dupes -w @lumpcode/cli --mode semantic --format json \
  > packages/apps/cli/cli.dupes.json
```

2. **Agent step** — `/find-cli-abstractions` using that JSON. It picks **one** new util name and writes:

```text
.lumpcode/lumps/abstractionImplementer/backlogItems/todo/<utilName>/
  desc.yml
  requirements.md
```

No product code yet. Cap pending items via `maxPendingAbstractions` (we use 5).

## 3. Implement the util

```bash
lumpcode run abstractionImplementer
# or leave it to the daemon
lumpcode start --include=abstractionImplementer --daemonId=abstractions
```

The implementer lump:

- reads `todo/<utilName>/`
- adds `packages/apps/cli/src/utils/<utilName>/` (`main.ts`, `index.ts`, tests, barrel)
- refactors call sites for net line reduction
- validates with `npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli`
- moves the item to `completed/` when done

## 4. Continuous loop

```bash
lumpcode start --include='abstraction*' --daemonId=abstractions
```

Merge the util PR → next finder tick hunts the next duplication. Fallow surfaces the smell; Lumpcode turns it into resumable branches you review like any other PR.
