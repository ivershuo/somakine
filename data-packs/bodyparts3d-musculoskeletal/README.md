# @somakine/bodyparts3d-musculoskeletal

Real musculoskeletal geometry derived from BodyParts3D 4.0. The pack contains
187 canonical structures across eight regions, including source-native
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

Regenerate from a previously acquired, verified Kinexis workspace:

```sh
npm run import:bodyparts3d -- --source /absolute/path/to/kinexis
```
