# `@somakine/cli` API reference

```sh
npm install @somakine/cli
```

The `soma` command-line tool validates, inspects, measures coverage, verifies
assets, and composes Somakine data packs and extensions. It uses the same
`@somakine/core` validation and composition contract as the Catalog and Viewer:
pack commands operate on `DataPack` files, `validate-extension` operates on a
`DataExtension`, and `compose` writes a normal `DataPack`.

- [Install and run](#install-and-run)
- [Commands](#commands)
  - [`soma validate`](#soma-validate)
  - [`soma inspect`](#soma-inspect)
  - [`soma coverage`](#soma-coverage)
  - [`soma verify-assets`](#soma-verify-assets)
  - [`soma validate-extension`](#soma-validate-extension)
  - [`soma compose`](#soma-compose)
- [Global flags](#global-flags)
- [Exit codes](#exit-codes)
- [Programmatic API](#programmatic-api)
  - [`runCommand(command, file, options?)`](#runcommandcommand-file-options)
  - [`RunCommandOptions`](#runcommandoptions)
  - [`CommandResult`](#commandresult)
  - [`SomaCommand`](#somacommand)

## Install and run

The package exposes the `soma` binary. Run it ad hoc with `npx`, or install it
globally when a system-wide command is preferred.

```sh
npx soma validate pack.json
# or, after `npm install -g @somakine/cli`
soma validate pack.json
```

Requires Node.js `>= 20`.

## Commands

Every command takes a `<file>` argument. It is a JSON `DataPack` for
`validate`, `inspect`, `coverage`, and `verify-assets`; a `DataExtension` for
`validate-extension`; and the base `DataPack` for `compose`. All commands accept
[`--json`](#global-flags) for machine-readable output.

### `soma validate`

```sh
soma validate <pack.json>
```

Validates a data pack against the executable contract. On success reports the
pack `id` and `version`. On failure prints the validation issues.

```sh
soma validate pack.json --json
# { "ok": true, "command": "validate", "data": { "id": "somakine-musculoskeletal-basic", "version": "0.2.0-alpha.0" } }
```

### `soma inspect`

```sh
soma inspect <pack.json>
```

Validates the pack, then prints a summary: identity (`id`, `version`,
`schemaVersion`), record counts (`regions`, `structures`, `relations`, `assets`,
`meshInstances`, `representations`-derived coverage), and the sorted list of
locale codes.

```jsonc
{
  "id": "somakine-musculoskeletal-basic",
  "version": "0.2.0-alpha.0",
  "schemaVersion": "0.1.0",
  "regions": 5,
  "structures": 9,
  "relations": 4,
  "assets": 6,
  "meshInstances": 9,
  "coverage": { "direct": 5, "compound": 1, "context": 2, "unavailable": 1 },
  "locales": ["en", "zh-CN"]
}
```

### `soma coverage`

```sh
soma coverage <pack.json>
```

Validates the pack and prints its coverage summary — the count of structures by
representation mode.

```sh
soma coverage pack.json
# coverage: ok
# { "direct": 5, "compound": 1, "context": 2, "unavailable": 1 }
```

### `soma verify-assets`

```sh
soma verify-assets <pack.json>
```

Validates the pack, then verifies every glTF asset on disk: each must live under
a safe relative path inside the pack file's directory (no traversal, no
absolute/remote URIs), be a regular file, match the declared byte count, and
match the declared SHA-256 digest. Reports the number of verified assets, or a
per-asset error list.

```sh
soma verify-assets pack.json
# { "verified": 12 }
```

```sh
soma verify-assets pack.json
# verify-assets: failed
# [
#   { "assetId": "somakine:asset:femur", "code": "asset_verification_failed",
#     "message": "sha256 mismatch: expected ab…, received cd…" }
# ]
```

Primitive assets have no runtime file and are skipped.

### `soma validate-extension`

```sh
soma validate-extension <extension.json> --base <pack.json>
```

Validates a `DataExtension`. Pass `--base` to also cross-check it against a
specific base pack (target pack id/version, locale references, and mapping
targets). Reports the extension `id`, `version`, `namespace`, and `targetPackId`
on success.

```sh
soma validate-extension knee.extension.json --base bodyparts3d.json
# { "id": "knee-extension", "version": "0.1.0", "namespace": "knee", "targetPackId": "somakine-bodyparts3d-musculoskeletal" }
```

Without `--base`, extension-owned records are checked structurally, but target
pack matches and references to base-only structures cannot be resolved. Always
validate again with the base (or use `compose`) before shipping an extension that
fills an existing structure.

### `soma compose`

```sh
soma compose <pack.json> <extension.json> [<extension.json>...] \
  [--policy fill-unavailable|prefer-extension|error-on-conflict] \
  [--output <composed.json>]
```

Validates the base pack and each extension, composes them with
`composeDataPacks()`, and prints the composition report. With `--output`, also
writes the composed `DataPack` to that file. The base pack is the first argument;
every following positional argument (that is not a flag value) is an extension
file, so you can compose many extensions in one pass.

```sh
soma compose bodyparts3d.json knee.extension.json shoulder.extension.json \
  --policy fill-unavailable --output composed.json
soma verify-assets composed.json
```

The written `composed.json` is a normal data pack; any product that understands
Somakine can render it without knowing which extensions were used. See
[developer data extensions](../DATA_EXTENSIONS.md) and the
[composition reference](core.md#composition) for policy semantics.

## Global flags

| Flag | Applies to | Description |
| --- | --- | --- |
| `--json` | all | Emit the full `CommandResult` as a single JSON object on stdout (success or failure) instead of the human-readable form. |
| `--base <file>` | `validate-extension` | The target base pack for cross-reference checks. |
| `--output <file>` | `compose` | Write the composed data pack to this path. |
| `--policy <policy>` | `compose` | One of `fill-unavailable` (default), `prefer-extension`, `error-on-conflict`. |

Without `--json`, a successful command prints `<command>: ok` followed by its
`data`, and a failed command prints `<command>: failed` followed by its `errors`
on stderr.

## Exit codes

- `0` — the command succeeded.
- `1` — the command ran but validation, verification, or composition failed
  (the structured result is still printed so a caller can inspect the issues).
- `2` — usage error (missing or unknown command, or missing `<file>`).

## Programmatic API

The same logic is available as a library, so you can embed validation and
composition in build scripts, CI, or servers without spawning a process.

```ts
import { runCommand } from "@somakine/cli";
import type { SomaCommand, RunCommandOptions, CommandResult } from "@somakine/cli";
```

### `runCommand(command, file, options?)`

```ts
async function runCommand(
  command: SomaCommand,
  file: string,
  options?: RunCommandOptions,
): Promise<CommandResult>
```

Runs one command against the JSON file at `file` (resolved to an absolute path).
Validation, verification, and composition failures return a `CommandResult` with
`ok: false` and structured `errors`. Reading/parsing the input file is also
returned as `read_failed`; other filesystem failures, such as an unwritable
`outputFile`, may reject the promise.

```ts
const result = await runCommand("validate", "./pack.json");
if (!result.ok) console.error(result.errors);

const composed = await runCommand("compose", "./base.json", {
  extensionFiles: ["./knee.extension.json", "./shoulder.extension.json"],
  conflictPolicy: "fill-unavailable",
  outputFile: "./composed.json",
});
```

For `verify-assets`, assets are resolved relative to the directory containing
`file`. The `data` and `errors` shapes match the CLI's `--json` output for each
command.

### `RunCommandOptions`

```ts
interface RunCommandOptions {
  baseFile?: string;                  // validate-extension target base pack
  extensionFiles?: readonly string[]; // compose extension paths
  outputFile?: string;                // compose output path
  conflictPolicy?: CompositionConflictPolicy;
}
```

### `CommandResult`

```ts
interface CommandResult {
  ok: boolean;
  command: SomaCommand;
  data?: unknown;   // shape depends on command (see below)
  errors?: unknown; // validation, asset, composition, or read-error list
}
```

The `data` shape per command (present when `ok: true`):

| Command | `data` |
| --- | --- |
| `validate` | `{ id, version }` |
| `inspect` | `{ id, version, schemaVersion, regions, structures, relations, assets, meshInstances, coverage, locales }` |
| `coverage` | `{ direct, compound, context, unavailable }` |
| `verify-assets` | `{ verified: number }` |
| `validate-extension` | `{ id, version, namespace, targetPackId }` |
| `compose` | `{ outputFile, ...CompositionReport, baseFile }` |

The `errors` shape is `ValidationIssue[]` for validation failures, an array of
`{ assetId, code, message }` for asset verification failures, an array of
`{ code, message }` for composition failures, or
`[{ code: "read_failed", message }]` when the file cannot be read or parsed.

### `SomaCommand`

```ts
type SomaCommand =
  | "validate" | "inspect" | "coverage" | "verify-assets"
  | "validate-extension" | "compose";
```
