# @somakine/react

A React component for the Somakine 3D anatomy viewer.

```sh
npm install @somakine/core @somakine/viewer @somakine/react three
```

`react` and `three` are peer dependencies and must be installed by the host application.

```tsx
import { useRef } from "react";
import { SomakineViewer, type SomakineViewerHandle } from "@somakine/react";
import { musculoskeletalBasic } from "@somakine/musculoskeletal-basic";

function Body() {
  const viewer = useRef<SomakineViewerHandle>(null);
  return (
    <SomakineViewer
      ref={viewer}
      dataset={musculoskeletalBasic}
      accessibleLabel="Interactive body model"
      onSelection={(selection) => console.log(selection.label)}
      onStateChange={(state) => console.log(state.phase, state.message)}
      style={{ height: "32rem" }}
    />
  );
}
```

The component owns the host element and the viewer's lifecycle (creation and
disposal). The viewer owns the canvas, scene, semantic events, verified loading,
and resource disposal. The host application still owns controls, navigation,
labels, panels, and educational content.

## Props

| Prop | Type | Notes |
| --- | --- | --- |
| `dataset` | `DataPack` | **Required.** Validated Somakine data pack. |
| `accessibleLabel` | `string` | **Required.** Canvas `aria-label`. |
| `locale` | `string` | Initial label language. Default `"en"`. |
| `background` | `string \| null` | Clear colour, or `null` for transparent. |
| `initialViewDirection` | `[number, number, number]` | Initial camera direction. |
| `initialViewUp` | `[number, number, number]` | Camera up axis. |
| `assetResolver` | `AssetResolver` | Custom GLB byte resolver. |
| `onSelection` | `(selection) => void` | Fires for a single selection. |
| `onSelectionGroup` | `(selections) => void` | Fires for every selection change. |
| `onStateChange` | `(state) => void` | Lifecycle state transitions. |
| `onError` | `(error) => void` | Creation failure (not unmount). |
| `className` | `string` | Host element class. |
| `style` | `CSSProperties` | Host element style; must provide a height. |

Creation-time props (`dataset`, `background`, `initialView*`, `assetResolver`,
`locale`) are read when the viewer is created. To change them, remount the
component — for example by changing its `key`.

## Imperative handle

A `ref` exposes the viewer's imperative methods. They are no-ops until the viewer
is ready (after `onStateChange` reports `phase: "ready"`).

```tsx
viewer.current?.setLocale("zh-CN");
viewer.current?.setInteractionMode("pan");
viewer.current?.selectStructure("femur");
viewer.current?.focusRegion("lower-limb");
viewer.current?.reset();
```

Remember that visibility operations (`setLayer`, `setVisible`, `focusStructure`,
`focusRegion`, `showBody`, `reset`) clear highlighting without emitting a
selection callback — clear your selection UI when calling them.

**API reference:** [docs/api/react.md](https://github.com/ivershuo/somakine/blob/main/docs/api/react.md)
