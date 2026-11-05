# Say where Lumpcode looked when a lump has no config file

When a lump folder had no config file, `getJsConfigFromLumpName` (`packages/apps/cli`) returned `Lump config not found for <lumpName>`. That message hid the next step. It did not say which folder was checked or which file names count as a config, so an operator with a typo'd folder, a `config.mts`, or a config in the wrong place had to read the source to find out.

It now returns:

```
No config.ts, config.js, or config.json in <project>/.lumpcode/lumps/<lumpName>
```

This error reaches operators from `run`, `lump-status`, `context-status`, `lump-plan`, and the daemon's skip warning (`lump "<name>": <message>; skipping`). The path already contains the lump name, so no information is lost. Behavior is otherwise unchanged: the same condition fails, with the same `Failure<string>` shape, and the lookup order is still `config.ts`, then `config.js`, then `config.json`.

Two unit tests pinned the old warning text, so I updated them to expect the new message with the temp lump path: `discoverLoadableLumpNames/unit.test.ts` and `validateDaemonLaunch/unit.test.ts`. No docs or E2E tests quoted the old string.

Tests: `npm run test -w=@lumpcode/cli` (161 files, 1212 tests pass) and root `npm run build` (passes).
