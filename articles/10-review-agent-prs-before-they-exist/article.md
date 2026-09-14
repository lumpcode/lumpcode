# Big agent PRs are hard to review. So I review them before they exist.

An agent PR that is already on the branch asks you to reconstruct intent from a finished diff. Extra files. A helper that grew. A rename you did not ask for. The review is late.

A big agent PR is what you get when nobody reviewed a small blast. So I review the change before any code exists.

## 1. Write the blast first

I keep a `blast.yml` with the ticket. The files that should move, a line of why, optional size, optional symbols I already know must change.

```yaml
desc: "Extract acquireLock so setup and teardown share one release callback."
files:
  src/lock.ts:
    desc: "New helper: acquire and release the path lock."
    "-": 0
    "+": 40
    symbols:
      acquireLock: create
      releaseLock: create
  src/run.ts:
    desc: "Call acquireLock. Drop the inlined lock block."
    "-": 12
    "+": 8
    symbols:
      run: update
```

That is a simplified blast from a real Lumpcode change. Same shape, fewer files.

Best case: I write it. An agent can draft it, or expand a first note. A human still reviews it thoroughly before implementation. If you first see that file inside the implementation PR, you are late.

`desc` is for humans. `files` is the blast. `symbols` are not exhaustive: `create`, `update`, or `delete` for names I already care about. `+` and `-` are expected size, not a pass or fail.

## 2. If the blast is already big, split the ticket

The file list has to fit in your head. If it does not, the PR will not either. Split until each blast is one reviewable slice. Those PRs stay small, precise, easy to review, and easy to combine.

That is the review you can still change. After the agent codes, you can merge, adjust, or close.

## 3. Then let the agent code

The agent implements against a blast you already reviewed. I use this blast pattern on my agentic PRs ([created by Lumpcode](https://github.com/lumpcode/lumpcode)). The implementation prompt does not restate the plan. It points at the file:

```
Read @blast.yml and try to match that blast if possible: prefer the listed files and stay close to the line estimates.
```

## 4. After the PR, you have a baseline

The blast is also something a script can read. Flag a `+/-` that blew a 10% band. Use a tighter band on `src/` than on tests. Flag a file that was not in the blast. Flag a listed symbol that did not move. Then an agent can explain only those gaps.

The exact bands are a later article. This one is the habit. Prepare the change with a blast. Implement telling the agent to match it. Review with the blast telling you where to look more closely.

Follow along at [x.com/ddyods](https://x.com/ddyods).
