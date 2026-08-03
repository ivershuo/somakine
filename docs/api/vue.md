# `@somakine/vue` API reference

```sh
npm install @somakine/core @somakine/viewer @somakine/vue three
```

A Vue 3 component that mounts the framework-neutral Somakine viewer. The
component owns the host element and the viewer's lifecycle (creation and
disposal); the viewer owns the canvas, scene, verified asset loading, picking,
focus, and resource disposal. The host application still owns the surrounding
markup, controls, navigation, and content.

`vue` and `three` are **peer dependencies** and must be installed by the host
application.

- [`<SomakineViewer>`](#somakineviewer)
- [Props](#props)
- [Events](#events)
- [Imperative handle](#imperative-handle)
- [Lifecycle and remounting](#lifecycle-and-remounting)

## `<SomakineViewer>`

```ts
const SomakineViewer: DefineComponent<SomakineViewerProps, ...>
```

A `defineComponent` rendered with an `h()` render function, so the package ships
as plain ESM and needs no `.vue` single-file compiler in the host build. It
renders a single host `<div>` and appends the viewer's canvas inside it. The host
fills its parent (`width: 100%; height: 100%`); the parent — or an inherited
`style` — must provide a height. `class` and `style` are inherited by the host
element automatically via Vue's default attribute fallthrough.

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
    :background="null"
    style="height: 32rem"
    @selection="onSelection"
    @state-change="onStateChange"
  />
</template>
```

## Props

| Prop | Type | Notes |
| --- | --- | --- |
| `dataset` | `DataPack` | **Required.** Validated Somakine data pack. |
| `accessible-label` | `string` | **Required.** Canvas `aria-label`. |
| `locale` | `string` | Initial label language. Default `"en"`. |
| `background` | `string \| null` | Clear colour (hex), or `null` for a transparent canvas. |
| `initial-view-direction` | `[number, number, number]` | Initial camera direction in the pack coordinate system. |
| `initial-view-up` | `[number, number, number]` | Camera up axis in the pack coordinate system. |
| `asset-resolver` | `AssetResolver` | Custom GLB byte resolver. The default resolver fetches `asset.uri`. |

These mirror `CreateSomakineOptions`; see the
[`@somakine/viewer` reference](./viewer.md#options-and-types) for option
semantics. Props are declared with runtime type validators; `null` is accepted
for `background`.

## Events

| Event | Payload | Fires |
| --- | --- | --- |
| `selection` | `ViewerSelection` | When exactly one structure is selected. |
| `selection-group` | `readonly ViewerSelection[]` | For every selection change, including multi-select and clears. |
| `state-change` | `ViewerState` | For every lifecycle state transition (`phase` + `message`). |
| `error` | `unknown` | When `createSomakine` rejects for a reason other than unmounting. |

The events mirror `createSomakine`'s `onSelection`, `onSelectionGroup`, and
`onStateChange` callbacks; see the [`@somakine/viewer` reference](./viewer.md).

## Imperative handle

```ts
interface SomakineViewerHandle {
  readonly canvas: HTMLCanvasElement | null;
  readonly isReady: boolean;
  setLocale(locale: string): void;
  setInteractionMode(mode: InteractionMode): void;
  setLayer(type: StructureType | null): void;
  selectStructure(id: StructureId): void;
  selectStructures(ids: readonly StructureId[]): void;
  focusStructure(id: StructureId): void;
  focusRegion(id: RegionId): void;
  setVisible(ids: readonly StructureId[]): void;
  setStructureStyle(id: StructureId, style: StructureStyle | null): void;
  showBody(): void;
  reset(): void;
}
```

The handle is exposed via `defineExpose` and forwards to the underlying
`SomakineViewer`. Methods are no-ops until the viewer is ready (`isReady` becomes
`true` after `state-change` reports `phase: "ready"`). The underlying methods are
documented under [`SomakineViewer` methods](./viewer.md#somakineviewer-methods).

```ts
viewer.value?.setLocale("zh-CN");
viewer.value?.setInteractionMode("pan");
viewer.value?.selectStructure("somakine:structure:femur");
viewer.value?.focusRegion("somakine:region:lower-limb");
viewer.value?.reset();
```

Visibility operations (`setLayer`, `setVisible`, `focusStructure`, `focusRegion`,
`showBody`, `reset`) clear highlighting **without** emitting a selection
event — clear your selection UI when you call them.

## Lifecycle and remounting

The viewer is created in `onMounted` and disposed in `onBeforeUnmount`. An
`AbortController` cancels in-flight creation on unmount, so a fast unmount during
loading is safe.

Creation-time props (`dataset`, `background`, `initial-view-direction`,
`initial-view-up`, `asset-resolver`, `locale`) are read when the viewer is
created. To change any of them, remount the component — for example with a
`:key`.

For live changes that do not require remounting, use the imperative handle
(`setLocale`, `setInteractionMode`, selection and visibility methods).
