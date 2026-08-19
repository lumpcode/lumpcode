# Agents keep rewriting the same block

Coding agents are good at matching local style. Ask one to add a helper, and it will write it the way the file already does it. If that pattern already lives in three other modules, the agent often copies it instead of extracting it. The same twenty-line block shows up in a fourth place. Then a fifth.

A single chat can extract that, if someone has already spotted it, and the copies sit in a modest set of files. That is not the usual path.

The usual path is to ship the feature and never ask. Checking "did we just duplicate something?" after every session costs you time. The chat also has the wrong context: it is not reading a deterministic dupes report, it is guessing from the files it already had open. And if you extract on top of the change you came to ship, the PR does two jobs. The refactor rides along with the feature, and the review gets too big.

What you want is that extraction running in the background, all the time. That is a **campaign**, not a favor you remember to ask at the end of a session.

## 1. Deterministic tools already see the repetition

For JavaScript and TypeScript, [Fallow](https://github.com/fallow-rs/fallow) (and tools like it) can emit a dupes report: same pattern, many sites. Other languages have their own scanners.

A report is the easy part. It does not name the util, does not write the plan, does not refactor the call sites, and does not open a reviewable PR.

## 2. What was missing is the loop above the scanner

**Git is the gate:** one abstraction, one branch, one PR. The unit of trust is a change a human can hold in their head.

**Git is the source of truth:** what landed lives in remote history. Merge three this week, leave the rest. What is left should come from the remote, not from a dashboard.

That is the job of a **git-first loop manager**. I am building one: Lumpcode. A **lump** is one campaign, described in the repo, worked through one isolated **context** at a time.

Vendor cloud agents already give you one task, one branch, one PR. Scanners already give you a list of smells. Lumpcode is the loop that turns the next smell into the next PR, for weeks, while you merge.

## 3. Detect, propose, plan, implement

The campaign I am running has four steps.

1. A deterministic step writes a dupes report.
2. An agent reads the report and proposes **exactly one** abstraction: a name, the call sites, why net lines should go down.
3. That proposal lands in git as a plan (`requirements.md`), not as product code.
4. A second lump implements the plan, rewrites the call sites to use it, writes tests, and retries until the verification command is green. Then it pushes a small branch.

The finder does not implement. The implementer does not hunt. You review the requirements PR first: the name, the scope, whether the util is real. Bad proposals die there, before anyone writes code. Merge the plan, then the implementation. Each tick is one slice. The next tick reads remote history and continues. The campaign is not supposed to finish.

The codebase gets smaller and better tested. One util replaces the copies, so net lines go down. Tests are written after the util exists and the call sites already use it, so the suite follows real usage and can infer edge cases from those sites instead of inventing a fake API. Coverage goes up: the shared path is tested on purpose, with tests those copies may not have had.

## 4. Where I am running it

At **Keolis**, a large French transportation company, this campaign is one of several lumps on the same codebase. Small PRs, retry until green, a cap on how many branches sit in review. It does not finish. A sibling lump normalizes utils that were never extracted. Same habit, different job.

The same pipeline is public in Lumpcode. Open `.lumpcode/lumps/abstractionFinder/` and `abstractionImplementer/` if you want to see how it is wired.

## 5. Lumpcode

Early development, Apache 2.0, on npm as `@lumpcode/cli`. Agents do not replace review. They feed it.

Repo: [https://github.com/lumpcode/lumpcode](https://github.com/lumpcode/lumpcode)

If you want to wire this in your own repo (scanner, two lumps, daemon), I wrote the setup as a how-to on DEV: [Set up an abstraction campaign](../07-setup-abstraction-campaign/article.md).

Follow along at [x.com/ddyods](https://x.com/ddyods).
