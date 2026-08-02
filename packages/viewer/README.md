# @somakine/viewer

```ts
const viewer = await createSomakine(container, {
  dataset,
  accessibleLabel: "Interactive body model",
  onSelection(selection) {},
});

viewer.setLocale("zh-CN");
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

`focusStructure` isolates the selected direct/compound structure, or the
declared context structures for a context-only entry. `showBody` and `reset`
restore the whole-body view. Camera framing and orbit limits are calculated
from the visible bounds. Packs with a non-default up/front axis can pass
`initialViewDirection` and `initialViewUp`; hosts can expose the canvas
guidance as “drag to rotate, scroll to zoom, right-drag to pan”.
