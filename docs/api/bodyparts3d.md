# `@somakine/bodyparts3d` API reference

```sh
npm install @somakine/core @somakine/bodyparts3d
```

An adapter that builds strictly validated Somakine data packs whose real geometry
comes from [BodyParts3D 4.0](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html).
It injects the required BodyParts3D source record and the CC BY 4.0 license, and
it refuses any asset that does not carry that exact provenance.

> This alpha adapter package contains **no BodyParts3D geometry**. To render
> verified geometry, use the published
> `@somakine/bodyparts3d-musculoskeletal` pack, which was built with this
> adapter.

- [Constants](#constants)
- [`createBodyParts3DPack(input)`](#createbodyparts3dpackinput)
- [`bodyParts3DAsset(input)`](#bodyparts3dassetinput)
- [Types](#types)
- [Provenance enforcement](#provenance-enforcement)

## Constants

```ts
import {
  BODY_PARTS_3D_SOURCE_ID,
  BODY_PARTS_3D_LICENSE_ID,
  BODY_PARTS_3D_ATTRIBUTION,
  BODY_PARTS_3D_SOURCE,
  BODY_PARTS_3D_LICENSE,
} from "@somakine/bodyparts3d";
```

| Constant | Value |
| --- | --- |
| `BODY_PARTS_3D_SOURCE_ID` | `"bodyparts3d-4"` |
| `BODY_PARTS_3D_LICENSE_ID` | `"CC-BY-4.0"` |
| `BODY_PARTS_3D_ATTRIBUTION` | `"BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International"` |

`BODY_PARTS_3D_SOURCE` and `BODY_PARTS_3D_LICENSE` are the fully-formed
`SourceRecord` and `LicenseRecord` the adapter prepends to every pack. Reuse them
in your own tooling so the provenance strings stay identical across packs.

```ts
BODY_PARTS_3D_SOURCE; // { id: "bodyparts3d-4", title: "BodyParts3D", version: "4.0", url, retrievedAt }
BODY_PARTS_3D_LICENSE; // { id: "CC-BY-4.0", name, url, attribution, redistribution: "attribution" }
```

## `createBodyParts3DPack(input)`

```ts
function createBodyParts3DPack(input: BodyParts3DPackInput): DataPack
```

Assembles a `DataPack` that always begins with the BodyParts3D source and CC BY
4.0 license (followed by any additional sources/licenses you pass), then runs
`assertDataPack` so the result is guaranteed valid. Returns a deep clone. Throws
if any asset is missing the required source or license provenance, or if the
assembled pack fails validation.

```ts
import { createBodyParts3DPack } from "@somakine/bodyparts3d";

const pack = createBodyParts3DPack({
  id: "my-bodyparts3d-pack",
  version: "0.1.0",
  title: "My BodyParts3D subset",
  description: "Curated BodyParts3D 4.0 geometry.",
  createdAt: "2026-08-01T00:00:00Z",
  regions,
  structures,
  relations,
  assets,           // each built with bodyParts3DAsset()
  meshInstances,
  representations,
  locales,
});
```

## `bodyParts3DAsset(input)`

```ts
function bodyParts3DAsset(input: BodyParts3DAssetInput): GltfAsset
```

A helper that builds a `GltfAsset` with the BodyParts3D source and CC BY 4.0
license already attached, plus any additional source IDs. Use it so every asset
carries identical provenance; `createBodyParts3DPack()` performs the full core
validation of the URI, digest, byte budget, and geometry fields.

```ts
import { bodyParts3DAsset } from "@somakine/bodyparts3d";

const femur = bodyParts3DAsset({
  id: "somakine:asset:femur",
  uri: "assets/femur.glb",
  mediaType: "model/gltf-binary",
  sha256: "0000000000000000000000000000000000000000000000000000000000000000", // replace with the real digest
  bytes: 1_234_567,
  vertices: 24_000,
  gpuBytes: 1_800_000,
});
```

The returned asset is `{ id, kind: "gltf", uri, mediaType, sha256, bytes,
geometry: { vertices, gpuBytes }, sourceIds: [BODY_PARTS_3D_SOURCE_ID, ...additional],
licenseId: BODY_PARTS_3D_LICENSE_ID }`.

## Types

```ts
interface BodyParts3DPackInput {
  id: string;
  version: string;
  title: string;
  description: string;
  createdAt: string;                        // ISO-8601 UTC
  additionalSources?: SourceRecord[];
  additionalLicenses?: LicenseRecord[];
  regions: Region[];
  structures: Structure[];
  relations: Relation[];
  assets: GltfAsset[];
  meshInstances: MeshInstance[];
  representations: Representation[];
  locales: LocalePack[];
}

interface BodyParts3DAssetInput {
  id: GltfAsset["id"];          // AssetId
  uri: string;                  // safe relative path
  mediaType: GltfAsset["mediaType"];
  sha256: string;               // 64 lowercase hex chars
  bytes: number;                // <= SOMAKINE_MAX_ASSET_BYTES
  vertices: number;
  gpuBytes: number;
  additionalSourceIds?: string[];
}
```

The `Region`, `Structure`, `Relation`, `MeshInstance`, `Representation`,
`LocalePack`, `SourceRecord`, `LicenseRecord`, and `GltfAsset` types come from
[`@somakine/core`](core.md#types).

## Provenance enforcement

The adapter exists to make honest provenance mechanical rather than optional.
Two guarantees hold for every pack it produces:

1. **The source and license are always present and first.** `BODY_PARTS_3D_SOURCE`
   and `BODY_PARTS_3D_LICENSE` are prepended to the registries before validation,
   so a BodyParts3D pack can never omit or reorder the canonical records.
2. **Every asset must cite them.** `createBodyParts3DPack` throws if any asset's
   `licenseId` is not `CC-BY-4.0` or its `sourceIds` does not include
   `bodyparts3d-4`. `bodyParts3DAsset` attaches both by construction.

This is why the adapter is not a privileged core dependency: it is an ordinary
`@somakine/core` consumer that enforces a source-specific policy on top of the
same validation every other pack passes. A second anatomy source would ship its
own adapter with the same shape.
