### `lumpcode context-status`

## Description

Inspect or update the status of a single context within a lump. It prints the `ContextStatusRecordItem` for that context. When used with `--setToFinished`, it updates the context's status to finished.

## Usage

```
lumpcode context-status <lump-name> <context-name> [--setToFinished] [--json]
```

## Arguments

| Argument | Description |
|---|---|
| `<lump-name>` | Name of the lump containing the context.|
| `<context-name>` | Name of the context to inspect or update. |


## Options

| Option | Description |
|---|---|
| `--setToFinished` | Create marker commit on `baseBranch` and push (mark context finished). |
| `--json` | JSON output. |

## Examples

```bash
# Show a context status
lumpcode context-status refactor-rules src_utils_helpers_ts

# Mark a context as `finished`
lumpcode context-status refactor-rules src_services_api_ts --setToFinished
```
