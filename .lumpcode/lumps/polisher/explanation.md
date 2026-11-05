# Say which helper, context, and variable fix a missing requireArtifactStep path

`requireArtifactStep(varName)` (`packages/recipes`) builds a validation command that checks whether the file named by a context variable exists. When the context does not set that variable, or sets it to an empty or non-string value, the helper threw:

```
Missing context variable REPORT
```

This happens when the context source does not set the variable that the author named in `requireArtifactStep('REPORT')`, for example after a typo or a renamed variable. The old message did not name the helper that needed the variable or the context that lacked it. It also did not say that the variable should hold a file path, so the author had to find the call site before fixing anything.

It now throws:

```
requireArtifactStep('REPORT'): context "fix-login" does not set REPORT to a path. Set REPORT in the context variables to the artifact path, relative to the workspace.
```

Behavior is otherwise unchanged. The same condition still throws an `Error` from the same place. Existing and missing artifacts still produce the same exit-0 and exit-1 commands. No docs quoted the old string, and `.agents/memory/domain/recipes.md` ("missing variable still throws") is still accurate.

One unit test pinned the old text. I updated it to expect the full new message: `packages/recipes/src/kit/requireArtifactStep/unit.test.ts`.

Tests: `npm run test -w=@lumpcode/recipes` (8 files, 97 tests pass) and root `npm run build` (passes).
