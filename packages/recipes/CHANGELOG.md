# Changelog

## Unreleased

- Breaking: `featureBacklog`, `backlog`, `abstractionFinder`, and `abstractionBacklog` are workflow recipes. The steps versions are `featureBacklogSteps`, `backlogSteps`, `abstractionFinderSteps`, and `abstractionBacklogSteps` (no aliases).
- `desc.yml` uses `stages`. `workflow` still runs and warns once per item each time the list is read. Setting both fails. Context variable `STAGES` is set to the same list as `WORKFLOW`.
- `setTaskDone` moves a finished backlog item to `completed/` and stamps `completedAt`.
- retryUntilGreen now takes { session, shell, check }; the steps version is retryUntilGreenSteps.
- `openPrPostTeardown` puts each pushed context's message in the pull request body, and opens a draft when a pushed context did not succeed (`draftOnFailure`, default true).
