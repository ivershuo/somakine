# @somakine/vue

A Vue 3 component for the Somakine 3D anatomy viewer.

```sh
npm install @somakine/core @somakine/viewer @somakine/vue three
```

`vue` and `three` are peer dependencies and must be installed by the host application.

```vue
<script setup lang="ts">
import { ref } from "vue";
import { SomakineViewer, type SomakineViewerHandle } from "@somakine/vue";
import { musculoskeletalBasic } from "@somakine/musculoskeletal-basic";

const viewer = ref<SomakineViewerHandle>();
</script>

<template>
  <SomakineViewer
    ref="viewer"
    :dataset="musculoskeletalBasic"
    accessible-label="Interactive body model"
    style="height: 32rem"
    @selection="(selection) => console.log(selection.label)"
    @state-change="(state) => console.log(state.phase, state.message)"
  />
</template>
```

The component owns the host element and the viewer's lifecycle (creation and
disposal). The viewer owns the canvas, scene, semantic events, verified loading,
and resource disposal. The host application still owns controls, navigation,
labels, panels, and educational content.

## Props

| Prop | Type | Notes |
| --- | --- | --- |
| `dataset` | `DataPack` | **Required.** Validated Somakine data pack. |
| `accessible-label` | `string` | **Required.** Canvas `aria-label`. |
| `locale` | `string` | Initial label language. Default `"en"`. |
| `background` | `string \| null` | Clear colour, or `null` for transparent. |
| `initial-view-direction` | `[number, number, number]` | Initial camera direction. |
| `initial-view-up` | `[number, number, number]` | Camera up axis. |
| `asset-resolver` | `AssetResolver` | Custom GLB byte resolver. |

`class` and `style` are inherited by the host element automatically (Vue's
default attribute fallthrough).

## Events

| Event | Payload | Fires |
| --- | --- | --- |
| `selection` | `ViewerSelection` | When exactly one structure is selected. |
| `selection-group` | `readonly ViewerSelection[]` | For every selection change. |
| `state-change` | `ViewerState` | Lifecycle state transitions. |
| `error` | `unknown` | Creation failure (not unmount). |

Creation-time props (`dataset`, `background`, `initial-view-*`, `asset-resolver`,
`locale`) are read when the viewer is created. To change them, remount the
component — for example with a `:key`.

## Imperative handle

A template `ref` exposes the viewer's imperative methods. They are no-ops until
the viewer is ready (after `state-change` reports `phase: "ready"`).

```ts
viewer.value?.setLocale("zh-CN");
viewer.value?.setInteractionMode("pan");
viewer.value?.selectStructure("femur");
viewer.value?.focusRegion("lower-limb");
viewer.value?.reset();
```

Remember that visibility operations (`setLayer`, `setVisible`, `focusStructure`,
`focusRegion`, `showBody`, `reset`) clear highlighting without emitting a
selection event — clear your selection UI when calling them.

**API reference:** [docs/api/vue.md](https://github.com/ivershuo/somakine/blob/main/docs/api/vue.md)
