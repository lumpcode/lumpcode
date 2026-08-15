# Set up an abstraction campaign

A scanner finds repeated code. One lump proposes a single abstraction as a plan in git. A second lump implements it, with tests, until green. You merge small PRs; the loop does not finish.

This is the setup. The argument for why this loop exists is [Agents keep rewriting the same block](../06-agents-keep-rewriting-the-same-block/article.md) (X). You should already have a Lumpcode project. If you do not, start with the [dedicated daemon how-to](https://github.com/lumpcode/lumpcode/blob/main/articles/05-hands-on-dedicated-daemon/article.md).

A **lump** is one campaign under `.lumpcode/lumps/<name>/`. Each **context** is one isolated unit of work: one branch, one PR.

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

Replace the finder config. The shipped `abstractionFinder` recipe is a useful skeleton (`ephemeralContextListFn`, backlog path). Override `steps` so a scanner runs first, and so the prompt is about **your** tree, not Lumpcode's CLI package (the recipe default still mentions `packages/apps/cli`).

`.lumpcode/lumps/abstractionFinder/config.ts`:

```ts
import { abstractionFinder } from '@lumpcode/recipes';

const backlogItemsDir = '.lumpcode/lumps/abstractionImplementer/backlogItems';

export default {
    ...abstractionFinder({
        maxPendingAbstractions: 1,
        scanDirectories: ['src'],
        backlogItemsDir,
        command: 'cursor',
        maximumNumberOfConcurrentBranches: 1,
    }),
    steps: [
        {
            commandFn() {
                return {
                    executable: 'sh',
                    args: [
                        '-c',
                        'npx fallow dupes --mode semantic --format json > .lumpcode/dupes.json < /dev/null',
                    ],
                };
            },
        },
        {
            promptTemplate: `Read @.lumpcode/dupes.json and scan @src for duplicated logic (same pattern, not merely similar file structure).

List existing names under @${backlogItemsDir}/todo/ and @${backlogItemsDir}/completed/. Do not re-propose those names.

Pick exactly one new abstraction:
- A util name matching ^[a-zA-Z0-9_-]+$
- Refactoring all call sites in src/ should reduce net line count (excluding new unit tests)

Create exactly one folder @${backlogItemsDir}/todo/<utilName>/ with:
- desc.yml: name, task, priority (max todo priority + 1, or 1)
- requirements.md: problem, goals and non-goals, proposed API, affected files, acceptance criteria (net reduction + unit tests)

Do not implement product code.`,
        },
    ],
};
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

Change `command`, `scanDirectories`, the Fallow invocation, and `implValidateCommand` (`npm test && npm run build`, a workspace `-w`, …). `/lumpcode` can reshape paths and prompts.

The implementer skips items without `requirements.md`. `configUrl: import.meta.url` is required so the recipe can resolve the project root.

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
