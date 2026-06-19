### `lumpcode start`

## Description

Start lumpcode as a background daemon that re-runs all lumps on a schedule. Each iteration picks up remaining `toDo` contexts, progressively working through the full context list. It updates the `contextStatus.json` of each lump when they are run.

## Usage

```
lumpcode start [--cronSetup] <cron-string> [--json]
```

## Options

| Option | Description |
|---|---|
| `--cronSetup <cron-string="*/5 * * * *">` | A cron expression defining the schedule (by default `"*/5 * * * *"` for every 5 minutes). |
| `--json` | JSON output. |

## Examples

```bash
# Run every 10 minutes
lumpcode start --cronSetup "*/10 * * * *"

# Run every hour
lumpcode start --cronSetup "0 * * * *"
```
