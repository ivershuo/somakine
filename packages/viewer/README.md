# @somakine/viewer

```sh
npm install @somakine/core @somakine/viewer three
```

`three` is a peer dependency and must be installed by the host application.

```ts
const viewer = await createSomakine(container, {
  dataset,
  accessibleLabel: "Interactive body model",
  onSelection(selection) {},
  onSelectionGroup(selections) {},
});

viewer.setLocale("zh-CN");
viewer.setInteractionMode("pan");
```

The host owns controls, navigation, labels, panels, and educational content.
The viewer owns the canvas, scene, semantic events, verified loading, and
resource disposal.

The default resolver supports self-contained binary GLB assets only. Hosts may
provide a custom resolver, but data-pack hashes and byte counts are still
verified before parsing.

To render developer-loaded data, compose extensions before creating the Viewer:

```ts
const { dataset } = composeDataPacks(basePack, [kneeExtension]);
const viewer = await createSomakine(container, {
  dataset,
  assetResolver: resolvePackAsset,
  accessibleLabel: "Interactive body model",
});
```

`resolvePackAsset` remains host-owned so local files, package assets, and
authenticated storage can use the same verified rendering contract.

`selectStructure` keeps the current visibility set and applies a distinct
selection style. `selectStructures(ids)` does the same for any arbitrary set
of IDs; the IDs do not need to share a Region, and `onSelectionGroup` receives
the resulting selection records. IDs are deduplicated, unknown IDs are
ignored, and an empty list clears the current highlight. `focusStructure` is
the explicit isolation operation for callers that want only the selected
direct/compound structure (or its declared context structures) visible.
`setStructureStyle(id, style)`
sets or clears a per-structure material style, including colour, emissive
treatment, opacity, and surface parameters. `showBody` and `reset` restore the
whole-body view.
`setInteractionMode("rotate" | "pan")` chooses whether primary mouse drag
rotates or pans the camera; the secondary drag keeps the opposite operation
available. Camera framing and orbit limits are calculated from the visible
bounds. Packs with a non-default up/front axis can pass
`initialViewDirection` and `initialViewUp`; hosts can expose the canvas
guidance from the active interaction mode, for example “drag to rotate,
right-drag to pan” or the inverse in pan mode.

Canvas picking is side-aware even when a source node contains bilateral
children: a normal click highlights only the raycast mesh, while Ctrl-click
or Cmd-click toggles additional picked meshes. Programmatic
`selectStructure` and `selectStructures` continue to operate on the semantic
Structure representation, which may intentionally contain bilateral geometry.
