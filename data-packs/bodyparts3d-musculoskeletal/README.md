# @somakine/bodyparts3d-musculoskeletal

```sh
npm install @somakine/core @somakine/viewer @somakine/bodyparts3d-musculoskeletal three
```

Real musculoskeletal geometry derived from BodyParts3D 4.0. The pack contains
180 canonical structures across eight regions, including source-native
joint/ligament/tendon meshes, reviewed compound coverage, and explicit
unavailable states where the source has no exact target representation.

BodyParts3D is © The Database Center for Life Science and licensed under
[CC Attribution 4.0 International](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html).
This data pack and its derived assets remain CC BY 4.0; the Somakine framework
code license does not relicense the anatomy data.
The imported Chinese terminology is review-pending and is not medical advice.
The supplemental source mapping and audit are shipped as
`public/supplemental-manifest.json`; its generated-asset notice is in
`public/LICENSE.bodyparts3d-supplemental.txt`.

The package exports `./pack.json` and `./assets/*`. Browser hosts must still
serve or bundle the GLB files and provide an `assetResolver` to the Viewer;
the Viewer intentionally does not read files directly from `node_modules`.
Bundlers that support asset URL imports can map each `asset.uri` (for example,
`assets/bodyparts3d/ankle-foot.glb`) to the corresponding exported asset URL.

The package also exports `bodyParts3DMusculoskeletalStats`, a TypeScript-readonly
summary of the included regions, structures, assets, and coverage. See the [data-pack
API reference](https://github.com/ivershuo/somakine/blob/main/docs/api/data-packs.md).

Regenerate from a previously acquired, verified source workspace:

```sh
npm run import:bodyparts3d -- --source /absolute/path/to/source-workspace
```

### Laterality (side) consolidation

As of pack version `4.0.0-somakine.1`, the supplemental side-specific structures
(`left-`/`right-` prefixed slugs such as `left-calcaneal-tendon`,
`right-calcaneal-tendon`, `left-long-plantar-ligament`, and
`right/left-stylohyoid-ligament`) are consolidated into their paired base
structures, whose source OBJ elements already split into left/right mesh
instances. Target one side of a paired structure through the viewer's side
option instead of a side-specific id:

```ts
viewer.selectStructure("somakine:structure:calcaneal-tendon", { side: "left" });
```

The shipped `generated.ts`/`pack.json` have been regenerated from the verified
source workspace and reflect this consolidated, side-addressable form.
