# Changelog

## Unreleased

- retryUntilGreen now takes { session, shell, check }; the steps version is retryUntilGreenSteps.
- `openPrPostTeardown` puts each pushed context's message in the pull request body, and opens a draft when a pushed context did not succeed (`draftOnFailure`, default true).
