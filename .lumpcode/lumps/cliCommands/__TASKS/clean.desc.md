### `lumpcode clean`

## Description

Delete locally and on the remote all branches/tags created by lump

## Usage

```
lumpcode clean [--lumpName] <lump-name> [--contextName] <context-name> [--json]
```

## Options

| Option | Description |
|---|---|
| `--lumpName <lump-name>` | If set, only the branches/tags for the specified lump are deleted. Otherwise all lumps are cleaned. |
| `--contextName <context-name>` | If set, only the branches that contains the specified context and tag for this context are deleted from the remote and local. lumpName is necessary for contextName to be used |
| `--json` | JSON output. |

## Examples

```bash
lumpcode clean
```
