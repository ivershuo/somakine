# Published data-pack exports

The data-pack packages export `DataPack` values rather than viewer functions.
The published packs are generated from checked source data; the viewer and
`SomakineCatalog` validate again when a host loads a pack. Install the pack you
need alongside `@somakine/core` or `@somakine/viewer`.

## `@somakine/musculoskeletal-basic`

```sh
npm install @somakine/musculoskeletal-basic
```

```ts
import { musculoskeletalBasic } from "@somakine/musculoskeletal-basic";
```

`musculoskeletalBasic` is a synthetic primitive pack for integration tests and
examples. It is not an anatomical evidence source.

## `@somakine/bodyparts3d-musculoskeletal`

```sh
npm install @somakine/bodyparts3d-musculoskeletal
```

```ts
import {
  bodyParts3DMusculoskeletal,
  bodyParts3DMusculoskeletalStats,
} from "@somakine/bodyparts3d-musculoskeletal";
```

`bodyParts3DMusculoskeletal` is the published BodyParts3D 4.0 pack. The package
also exports `bodyParts3DMusculoskeletalStats`, a TypeScript-readonly build-time
summary:

```ts
bodyParts3DMusculoskeletalStats;
// {
//   regions: 8,
//   structures: 180,
//   assets: 15,
//   coverage: { direct: 151, compound: 4, context: 0, unavailable: 25 },
// }
```

The summary is metadata, not a replacement for runtime queries. Use
`SomakineCatalog` for localized labels, structure lookup, relations, and live
coverage calculations.

Browser hosts must serve or bundle the pack's GLB assets and provide an
`assetResolver` to `@somakine/viewer`; see the [viewer reference](viewer.md) and
the [pack README](../../data-packs/bodyparts3d-musculoskeletal/README.md).
