# @somakine/cli

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
