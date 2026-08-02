# Data-pack schema

Every pack has an independent `id`, `version`, and `schemaVersion`.

An optional `DataExtension` is validated against a target pack and composed into
a normal `DataPack` with `composeDataPacks()`. Its extension-owned IDs must use
its declared namespace. Existing structure IDs are referenced through explicit
mappings, so a source cannot silently rename or replace an anatomical concept.

- `structures` describe anatomical concepts.
- `regions` describe overlapping views over structures.
- `relations` describe neutral anatomy relationships.
- `representations` describe visual coverage claims.
- `meshInstances` connect scene objects to immutable assets.
- `assets` describe primitive or glTF resources and their budgets.
- `sources` and `licenses` are required provenance registries.
- `locales` contain labels and aliases, never educational or clinical prose.

Coverage modes:

- `direct`: target geometry exists.
- `compound`: reviewed target presentation uses multiple instances.
- `context`: the target is missing; related structures may be focused.
- `unavailable`: no target or contextual visual is provided.

Contextual geometry must never be labeled or emitted as the target structure.
See `schemas/data-pack.schema.json` and `@somakine/core` for the executable
contract. See `schemas/data-extension.schema.json` for the extension contract.

The default composition policy is `fill-unavailable`: a direct or compound
extension may replace `unavailable` or `context` coverage, but direct-to-direct
conflicts fail. Hosts can opt into `prefer-extension` or require
`error-on-conflict`.
