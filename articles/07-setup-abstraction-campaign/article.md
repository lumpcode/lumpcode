# Turn a dupes report into small PRs with Lumpcode

Lumpcode is a **git-first loop manager**: a small CLI that runs long agent campaigns over your own repo, in reviewable slices. Git is the gate (one PR at a time) and the source of truth (what is left is read from remote history, not a distant database). You describe the campaign once, merge what is good, and the next tick continues with the rest.

A **lump** is one campaign under `.lumpcode/lumps/<name>/`. Each **context** is one isolated unit of work: one branch, one PR. You can run a tick by hand, or leave a daemon on a machine that stays on.

This article is one campaign: a scanner finds repeated code; one lump proposes a single abstraction as a plan in git; a second lump implements it, with tests, until green. You merge small PRs; the loop does not finish.

The argument for why loops should plug into git is [Codemods grew a brain. Our tooling didn't.](https://github.com/lumpcode/lumpcode/blob/main/articles/04-why-lumpcode/article.md). If you do not have a Lumpcode project yet, start with the [dedicated daemon how-to](https://dev.to/dyod/hands-on-dedicated-lumpcode-daemon-5c38).

Use `/lumpcode` in your agent session when you hit a config question (`npx skills add lumpcode/skills`).

## 1. What you are building

Two lumps, one backlog folder:

```text
.lumpcode/lumps/abstractionFinder/     # scan + write one plan
.lumpcode/lumps/abstractionImplementer/
  backlogItems/
    todo/<utilName>/desc.yml
    todo/<utilName>/requirements.md
    completed/<utilName>/              # after a merged implementer run
```

- **Finder:** one ephemeral context per tick. Reads a dupes report, writes `todo/<name>/`, does **not** implement.
- **Implementer:** one backlog item that already has `requirements.md` → implement, refactor call sites, tests, `retryUntilGreen` → move to `completed/`.

Cap how many plans sit unmerged (`maxPendingAbstractions`, `maximumNumberOfConcurrentBranches`) so the finder does not outrun review.

## 2. Project deps

On the laptop repo (commit these before the dedicated clone needs them):

```bash
npm install --save-dev @lumpcode/cli-utils @lumpcode/recipes
```

The global CLI does not resolve recipes. If `cli-utils` / `recipes` are already in `package.json` from the daemon how-to, skip this.

## 3. Pick a scanner

The first finder step should be deterministic. For JS/TS, [Fallow](https://github.com/fallow-rs/fallow) is the example:

```bash
npx fallow dupes --mode semantic --format json > .lumpcode/dupes.json
```

Point it at the package or tree you care about (`-w @your/package` if you use workspaces). Other languages: any tool that writes a report the agent can `@`. The lump only needs a file.

## 4. Scaffold the two lumps

```bash
lumpcode lump-create abstractionFinder --config ts
lumpcode lump-create abstractionImplementer --config ts
```

Replace the finder config. `abstractionFinder` counts pending `todo/` items, emits one context per tick while under `maxPendingAbstractions`, and takes an optional `scanCommand` plus `scanDirectories` for the default prompt.

`.lumpcode/lumps/abstractionFinder/config.ts`:

```ts
import { abstractionFinder } from '@lumpcode/recipes';

const backlogItemsDir = '.lumpcode/lumps/abstractionImplementer/backlogItems';

export default abstractionFinder({
    configUrl: import.meta.url,
    maxPendingAbstractions: 1,
    scanDirectories: ['src'],
    backlogItemsDir,
    command: 'cursor',
    maximumNumberOfConcurrentBranches: 1,
    scanCommand:
        'npx fallow dupes --mode semantic --format json > .lumpcode/dupes.json < /dev/null',
});
```

`.lumpcode/lumps/abstractionImplementer/config.ts`:

```ts
import { abstractionBacklog } from '@lumpcode/recipes';

export default abstractionBacklog({
    command: 'cursor',
    configUrl: import.meta.url,
    maximumNumberOfConcurrentBranches: 1,
    implValidateCommand: 'npm test',
});
```

Change `command`, `scanDirectories`, `scanCommand`, and `implValidateCommand` (`npm test && npm run build`, a workspace `-w`, …). Pass `steps` when the default prompt is not enough. `/lumpcode` can reshape paths and prompts.

The implementer skips items without `requirements.md`. Both recipes need `configUrl: import.meta.url` so they can resolve the project root.

## 5. Dry run

On the laptop (shared mode, checkout untouched):

```bash
lumpcode lump-plan abstractionFinder --plan --contexts
lumpcode lump-plan abstractionImplementer --plan --contexts
```

Finder should preview a scan + a prompt that writes a folder, not code. Implementer with an empty `todo/` is a valid empty plan.

Optional: run one finder context and review the requirements PR before the implementer is allowed to code:

```bash
lumpcode run abstractionFinder
```

## 6. Merge the configs, let the daemon tick

Commit both lumps (and `package.json` / lockfile if you added recipes here), push, merge to your primary branch.

On the dedicated worker, `npm install` is already done if recipes were in the first project push. Then:

```bash
lumpcode start --include='abstractionFinder,abstractionImplementer'
```

Or `'abstraction*'`. You do not restart for new backlog items. You do restart if you change `local.json`.

Default is one context per branch. Merge implementer PRs into primary. If you squash or rebase, keep the `LUMP: abstractionImplementer - <name>` line in the commit message. Drop it and Lumpcode treats that item as not done.

Finder stays eligible: new ephemeral contexts, same campaign.

## 7. Disable

In either config (or both):

```ts
disabled: true,
```

Push and merge. The next tick soft-skips that lump. The daemon stays up.

That's all. The loop is public in [Lumpcode](https://github.com/lumpcode/lumpcode) under `.lumpcode/lumps/abstractionFinder/` and `abstractionImplementer/`. Follow along at [x.com/ddyods](https://x.com/ddyods).
