# Tell apart "no such context" and "filtered out by --todoOnly" in lump-plan --contextName

`lumpcode lump-plan <lump> --contextName <name>` (`planLumpFromJsConfig` in `packages/apps/cli`) used one message whenever no context was left after filtering:

```
Context "ctx1" not found in resolved context list
```

That message was wrong when `--todoOnly` was also set. The todo filter runs before the name filter, so a context that is in the list but is `branchPushed`, `finished`, or waiting on `dependsOnContexts` was reported as "not found". An operator who checked the config and saw the context there had no way to know that the todo filter had removed it. In the plain typo case, the message also did not name the lump or say how to see valid names.

The util now keeps the resolved names from before the todo filter and returns one of two messages:

```
Context "ctx1" of lump "preview-lump" is not toDo (it is branchPushed, finished, or waiting on dependsOnContexts). Drop --todoOnly to preview it anyway.
```

```
Context "missing" is not in the context list of lump "preview-lump". Run lumpcode lump-plan preview-lump --contexts to list context names.
```

Behavior is otherwise unchanged. The command still fails at the same point, and no context is shown that was not shown before. `setup` also calls this util, but it never passes `contextName`, so it is not affected. No docs, tests, or memory quoted the old string.

I added two unit tests to `packages/apps/cli/src/utils/planLumpFromJsConfig/unit.test.ts`, one per message. The `--todoOnly` test pushes a `LUMP: preview-lump - ctx1` marker to `origin/main`, which makes the context `finished`.

Tests: `npm run test -w=@lumpcode/cli` (165 files, 1246 tests pass) and root `npm run build` (passes). Before the build, the CLI test run had one failure: `scripts/npm-pack-postinstall.unit.test.mjs` needs `dist/index.js`. It passed once the bundle existed.
