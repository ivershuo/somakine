# @somakine/cli

```sh
npm install @somakine/cli
```

The package exposes the `soma` binary; use `npx soma ...` from a project or
install it globally when a system-wide command is preferred.

```sh
soma validate pack.json
soma inspect pack.json
soma coverage pack.json
soma verify-assets pack.json
soma validate-extension extension.json --base pack.json
soma compose pack.json extension.json --output composed.json
```

All commands support `--json`. Asset verification only reads safe relative glTF
paths below the pack file's directory. `soma compose` accepts multiple extension
files, validates their mappings and provenance, and uses
`--policy fill-unavailable` by default. Other policies are
`prefer-extension` and `error-on-conflict`.

**API reference:** [docs/api/cli.md](https://github.com/ivershuo/somakine/blob/main/docs/api/cli.md) — every command,
flag, exit code, and the programmatic `runCommand` API with examples.
