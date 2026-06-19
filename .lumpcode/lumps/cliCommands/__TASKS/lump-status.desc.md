### `lumpcode lump-status`

## Description

Updates the `contextStatus.json` of a lump from the distant git repo and display the full json (a `LumpContextStatusRecord` object). This gives you an overview of every context in the lump and its current status.

If you omit `<lump-name>` it updates and display for every lump in the current project.

## Usage

```
lumpcode lump-status [--lumpName <lump-name>] [--silent] [--json]
```

## Options

| Option | Description |
|---|---|
| `--lumpName <lump-name>` | Name of the lump to inspect. |
| `--silent` | Print summary lines only; omit pretty-printed status JSON (default is verbose when not using `--json`). |
| `--json` | JSON output. |

## Examples

```bash
# Update and show the statuses for all lumps of the project
lumpcode lump-status

# Update and show the statuses for one lump
lumpcode lump-status --lumpName refactor-files

# Update statuses for one lump without printing the JSON map
lumpcode lump-status --lumpName refactor-files --silent
```
