# Watch it work

A worker runs unattended, but you can see everything it does: a live dashboard, the agent's transcript for each run, the scheduler log, and what is done per lump, read from git.

| You want to know | Run |
| --- | --- |
| Is the worker up, what is it running right now? | `lumpcode dashboard` or `lumpcode daemon-status` |
| What is the agent doing on this lump? | `lumpcode transcript --lumpName <lumpName>` |
| Why did a pass skip or fail? | `lumpcode daemon-log` |
| Which items are done, pushed, or left? | `lumpcode lump-status --lumpName <lumpName>` |

All of these run on the worker clone. `lump-status` also works on your laptop, because status comes from git.

## Dashboard

```bash
lumpcode dashboard
# Dashboard: http://127.0.0.1:4747
```

A read-only page for this project's worker: each daemon, the lump and item it is working on, the next pass, and the supervisor that keeps daemons alive. It refreshes every few seconds and warns when its data is stale. Nothing on the page can start or stop anything.

It stays in the foreground until Ctrl+C. Change the port with `--port`. On a remote worker, keep the default `127.0.0.1` bind and tunnel to it:

```bash
ssh -L 4747:127.0.0.1:4747 my-worker
```

`--bind 0.0.0.0` works but the page has no authentication, and the CLI says so.

## Transcripts

Every worker run writes the agent's live output to a transcript file, one per lump per pass. Follow the latest one:

```bash
lumpcode transcript --lumpName backlog          # last 10 lines, then live
lumpcode transcript --lumpName backlog --lines 0 --noFollow   # whole file
lumpcode transcript --list                      # every transcript, newest first
```

On your laptop, `lumpcode run` prints the same feed in the terminal and writes no file.

Too noisy? Set `outputDetail: "quiet"` in `lumpVariables` (or per step in `stepVariables`) to keep the agent's messages and drop tool activity. Turn files off with `"writeTranscripts": false` on the lump, `local.json`, or `project.json`. Old transcripts are deleted after 14 days; change that with `logRetention` in [local config](../config/local.md).

## Daemon status and log

```bash
lumpcode daemon-status            # every daemon for this project, plus the supervisor
lumpcode daemon-status --json     # inFlightRuns, nextTickAt, localConfigStale, …
lumpcode daemon-log               # follow the scheduler log
lumpcode daemon-log --noFollow --lines 100
```

The daemon log is the scheduler's own story: which lumps it found, which it skipped and why (disabled, too many open branches, a busy workspace), and errors. The agent's output is in the transcript, not here.

`localConfigStale: true` means you edited `local.json` or `project.json` after the worker started. Run `lumpcode restart`.

## What is done

```bash
lumpcode lump-status --lumpName backlog
```

Each item is `toDo`, `branchPushed` (a branch with its marker is on the remote, not merged yet), or `finished` (merged). This is read from your git remote, so it is the same on every machine. See [How a run works](run.md#where-done-lives).

## Keep a record per item

`"keepHistory": true` on a lump appends every step's prompt and output to `.lumpcode/lumps/<lumpName>/history/<contextName>.yaml`, on the laptop and the worker. Useful when you tune a prompt across several items. It is gitignored; agent output can contain secrets.
