# Somakine

> The open body framework.

Somakine is a framework-neutral TypeScript foundation for interactive human
anatomy products. It separates anatomical identity, visual representations,
mesh instances, assets, provenance, and product content so education, fitness,
and rehabilitation experiences can share one honest body layer without sharing
an application architecture.

Try the [live example](https://somakine.pages.dev).

![Screenshot of the live example](https://somakine.pages.dev/screenshot.png)

## Alpha capabilities

- canonical anatomy IDs and many-to-many regions;
- strict data-pack validation and deterministic catalog queries;
- direct, compound, contextual, and unavailable visual coverage;
- source, license, attribution, digest, and geometry-budget contracts;
- developer-loaded `DataExtension` packs with deterministic composition policies;
- a Three.js viewer with layers, picking, focus, reset, abort, and disposal;
- a CLI for validation, inspection, coverage, and asset verification;
- a standalone vanilla example using the real BodyParts3D 4.0 musculoskeletal pack.

## Quick start

```sh
npm install
npm run check
npm run dev
```

Then open the local URL printed by Vite.

## Developer example

Install the published viewer, a small starter data pack, and its Three.js peer
dependency:

```sh
npm install @somakine/viewer @somakine/musculoskeletal-basic three
```

Give the viewer a container with an explicit height, then initialize it from
your browser entry point:

```html
<div id="somakine-viewer" style="height: 32rem"></div>
```

```ts
import { createSomakine } from "@somakine/viewer";
import { musculoskeletalBasic } from "@somakine/musculoskeletal-basic";

const container = document.querySelector<HTMLElement>("#somakine-viewer");
if (!container) throw new Error("Missing #somakine-viewer");

const viewer = await createSomakine(container, {
  dataset: musculoskeletalBasic,
  accessibleLabel: "Somakine anatomy model",
  onSelection(selection) {
    console.log("selected", selection.label, selection.structure.id);
  },
});

viewer.setLayer("bone");
viewer.setStructureStyle("somakine:structure:femur", {
  color: "#bf7a5a",
  emissive: "#3a1610",
  emissiveIntensity: 0.25,
});
viewer.selectStructures([
  "somakine:structure:femur",
  "somakine:structure:humerus",
]);
```

The starter pack uses generated primitives, so this example needs no asset
loader. For the real BodyParts3D geometry, install
`@somakine/bodyparts3d-musculoskeletal`, replace `dataset` with
`bodyParts3DMusculoskeletal`, and configure your bundler's asset URLs through
the viewer's `assetResolver`; the data-pack README documents that setup.

## Packages

- `@somakine/core` — schema, validation, catalog, and public types.
- `@somakine/viewer` — framework-neutral Three.js viewer.
- `@somakine/bodyparts3d` — BodyParts3D provenance and adapter helpers.
- `@somakine/cli` — `soma` validation and inspection commands.
- `@somakine/musculoskeletal-basic` — synthetic alpha fixture and demo pack.
- `@somakine/bodyparts3d-musculoskeletal` — verified BodyParts3D 4.0 geometry,
  canonical identities, bilingual labels, and honest coverage metadata.

Extensions are ordinary JSON/TypeScript data contributions. Validate one with
`soma validate-extension`, compose it with a base pack using `soma compose`, or
call `composeDataPacks()` directly before passing the resulting `DataPack` to
the Viewer. Extension assets retain their own provenance and are loaded through
the host's `AssetResolver`. See [developer data extensions](docs/DATA_EXTENSIONS.md)
for the authoring contract and conflict policies.

## Safety and scope

Somakine is infrastructure, not medical advice, diagnosis, treatment, exercise
prescription, or a substitute for professional care. Data packs must disclose
their sources, licenses, review state, and unavailable geometry.

## License

Framework code is licensed under MIT. Data packs and visual assets retain their
own licenses and attribution requirements; for example, the BodyParts3D pack
remains CC BY 4.0. See [NOTICE](NOTICE).
