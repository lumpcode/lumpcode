### `lumpcode lump-create`

## Description

Create a new lump configuration file inside the current project.

## Usage

```
lumpcode lump-create <lump-name> [--config] <ts|js|json> [--json]
```

## Arguments

| Argument | Description |
|---|---|
| `<lump-name>` | Name of the lump to create. |

## Options

| Option | Description |
|---|---|
| `--config <ts\|js\|json=json>` | Configuration file format. |
| `--json` | JSON output. |

## Examples

```bash
# Create a JSON lump config (--config default is 'json')
lumpcode lump-create add-tests

# Create a TypeScript lump config
lumpcode lump-create refactor-rules --config ts

# Create a JavaScript lump config
lumpcode lump-create fix-imports --config js
```
