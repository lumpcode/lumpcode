# Keep the cause when listing project files fails

Before a run, `getToDoContextList` (`packages/core/src/helpers/getToDoContextList/main.ts`) lists the project's files with `getCodeBasePaths`. That helper fails when the project root cannot be read, and its message names the directory and the OS error. `getToDoContextList` dropped that message and returned only:

```
Failed to get code base paths
```

All three callers show this message as-is: `runLump` (prefixed with "Failed to get to do context list"), `lump-plan --todoOnly`, and the dashboard's lump scoring. So an operator got no hint about which path failed or why.

The message now keeps the cause:

```
Failed to get code base paths: Failed to scan directory: Error: Cannot read directory /path/to/root: Error: ENOENT: no such file or directory, scandir '/path/to/root'
```

The same inputs fail at the same point; only the text is longer. No docs, tests, or memory quoted the old string.

I added one unit test to `packages/core/src/helpers/getToDoContextList/unit.test.ts`. It points `projectRoot` at a missing directory and checks that the message names it.

Tests: `npm run test -w=@lumpcode/core` (27 files, 201 tests pass, 4 skipped) and root `npm run build` (passes).
