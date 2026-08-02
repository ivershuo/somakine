# Developer data extensions

Somakine does not require every anatomy source to be bundled into the core
repository. A developer can ship a small `DataExtension` next to a product and
compose it with a verified base pack.

## Authoring flow

1. Convert source geometry to a self-contained GLB or use a Somakine primitive.
2. Give every extension-owned region, structure, relation, representation,
   instance, and asset an ID under the extension `namespace`.
3. Add source and license records for every contributed asset and mapping.
4. Map an existing canonical structure explicitly when the extension supplies
   its representation. New structures do not need a mapping.
5. Provide labels for every new structure and region in every locale present in
   the base pack.
6. Validate and compose the extension before creating the Viewer.

```ts
import { composeDataPacks } from "@somakine/core";
import { createSomakine } from "@somakine/viewer";

const { dataset, report } = composeDataPacks(basePack, [kneeExtension], {
  conflictPolicy: "fill-unavailable",
});

const viewer = await createSomakine(container, {
  dataset,
  accessibleLabel: "Interactive body model",
  assetResolver: resolvePackAsset,
});
```

`resolvePackAsset` is intentionally host-owned. It can map an extension asset
ID to a local `File`, package URL, or authenticated storage while the Viewer
still verifies the declared byte count and SHA-256 digest.

## Composition policies

- `fill-unavailable` (default): a direct or compound extension can replace
  `unavailable` or `context` coverage. Existing direct/compound geometry is
  never silently replaced.
- `prefer-extension`: a direct or compound extension may explicitly replace
  existing coverage.
- `error-on-conflict`: any extension representation for an already-covered
  structure fails composition.

All existing-target representations require a `mappings` entry with a match
type, confidence, review state, and source IDs. Composition preserves every
source and license record and rejects duplicate IDs and ambiguous GLB URIs.

## CLI

```sh
soma validate-extension knee.extension.json --base bodyparts3d.json
soma compose bodyparts3d.json knee.extension.json shoulder.extension.json \
  --policy fill-unavailable --output composed.json
soma verify-assets composed.json
```

The resulting `composed.json` is a normal `DataPack`; any product that already
understands Somakine can render it without knowing which sources were used.
