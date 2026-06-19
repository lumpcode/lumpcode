### `lumpcode run`

## Description

Run a lump once. This triggers a single `runLump` invocation that processes the next batch of `toDo` contexts. It updates the `contextStatus.json` of the lump.

## Usage

```
lumpcode run <lump-name> [--json]
```

## Arguments

| Argument | Description |
|---|---|
| `<lump-name>` | Name of the lump to run. |

## Options

| Option | Description |
|---|---|
| `--json` | JSON output. |

## Examples

```bash
# Run the refactor-rules lump
lumpcode run refactor-rules

# Run the add-tests lump
lumpcode run add-tests
```
