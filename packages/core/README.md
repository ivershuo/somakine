# @somakine/core

```sh
npm install @somakine/core
```

Framework-neutral Somakine domain types, strict data-pack validation, immutable
catalog indexes, localized labels, search, and coverage queries.

Developer-owned or third-party additions use `DataExtension` and
`composeDataPacks()`. Extensions declare a target pack, namespace, mappings,
provenance, and assets; composition returns a normal `DataPack` for the
existing Viewer. The default `fill-unavailable` policy never replaces reviewed
direct geometry. Use `prefer-extension` only when an explicit host policy wants
an extension to replace an existing representation.

This package has no DOM, renderer, filesystem, network, or clinical-content
dependency.

**API reference:** [docs/api/core.md](https://github.com/ivershuo/somakine/blob/main/docs/api/core.md) — every catalog
method, validator, composer, type, and error with examples.
