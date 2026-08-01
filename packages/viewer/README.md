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
