# `@somakine/react` API reference

```sh
npm install @somakine/core @somakine/viewer @somakine/react three
```

A React component that mounts the framework-neutral Somakine viewer. The
component owns the host element and the viewer's lifecycle (creation and
disposal); the viewer owns the canvas, scene, verified asset loading, picking,
focus, and resource disposal. The host application still owns the surrounding
markup, controls, navigation, and content.

`react` and `three` are **peer dependencies** and must be installed by the host
application.

- [`<SomakineViewer>`](#somakineviewer)
- [Props](#props)
- [Imperative handle](#imperative-handle)
- [Callbacks and events](#callbacks-and-events)
- [Lifecycle and remounting](#lifecycle-and-remounting)

## `<SomakineViewer>`

```tsx
function SomakineViewer(
  props: SomakineViewerProps,
  ref: Ref<SomakineViewerHandle>,
): JSX.Element
```

A `forwardRef` component rendered with the automatic JSX runtime. It renders a
single host `<div>` and appends the viewer's canvas inside it. The host fills its
parent (`width: 100%; height: 100%`); the parent — or the `style` prop — must
provide a height.

```tsx
import { useRef, useState } from "react";
import { SomakineViewer, type SomakineViewerHandle, type ViewerState } from "@somakine/react";
import { musculoskeletalBasic } from "@somakine/musculoskeletal-basic";

function Anatomy() {
  const viewer = useRef<SomakineViewerHandle>(null);
  const [phase, setPhase] = useState<ViewerState["phase"]>("loading");
  return (
    <SomakineViewer
      ref={viewer}
      dataset={musculoskeletalBasic}
      accessibleLabel="Interactive body model"
      background={null}
      onStateChange={(state) => setPhase(state.phase)}
      onSelection={(selection) => console.log(selection.label, selection.structure.id)}
      style={{ height: "32rem" }}
    />
  );
}
```

## Props

```ts
interface SomakineViewerProps {
  dataset: DataPack;
  accessibleLabel: string;
  locale?: string;
  background?: string | null;
  initialViewDirection?: readonly [number, number, number];
  initialViewUp?: readonly [number, number, number];
  assetResolver?: AssetResolver;
  onSelection?: (selection: ViewerSelection) => void;
  onSelectionGroup?: (selections: ViewerSelectionGroup) => void;
  onStateChange?: (state: ViewerState) => void;
  onError?: (error: unknown) => void;
  className?: string;
  style?: CSSProperties;
}
```

| Prop | Type | Notes |
| --- | --- | --- |
| `dataset` | `DataPack` | **Required.** Validated Somakine data pack. |
| `accessibleLabel` | `string` | **Required.** Canvas `aria-label`. |
| `locale` | `string` | Initial label language. Default `"en"`. |
| `background` | `string \| null` | Clear colour (hex), or `null` for a transparent canvas. |
| `initialViewDirection` | `[number, number, number]` | Initial camera direction in the pack coordinate system. |
| `initialViewUp` | `[number, number, number]` | Camera up axis in the pack coordinate system. |
| `assetResolver` | `AssetResolver` | Custom GLB byte resolver. The default resolver fetches `asset.uri`. |
| `className` | `string` | Host element class (default `"somakine-host"`). |
| `style` | `CSSProperties` | Host element inline style. Must provide a height. |

These mirror `CreateSomakineOptions`; see the
[`@somakine/viewer` reference](./viewer.md#options-and-types) for option
semantics.

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

The handle is stable for the component's lifetime and forwards to the underlying
`SomakineViewer`. Methods are no-ops until the viewer is ready (`isReady` becomes
`true` after `onStateChange` reports `phase: "ready"`). The underlying methods are
documented under [`SomakineViewer` methods](./viewer.md#somakineviewer-methods).

```tsx
viewer.current?.setLocale("zh-CN");
viewer.current?.setInteractionMode("pan");
viewer.current?.selectStructure("somakine:structure:femur");
viewer.current?.focusRegion("somakine:region:lower-limb");
viewer.current?.reset();
```

## Callbacks and events

- `onSelection(selection)` — fires when exactly one structure is selected
  (programmatic or click). Mirrors `createSomakine`'s `onSelection`.
- `onSelectionGroup(selections)` — fires for every selection change, including
  multi-select and clears (empty array). Mirrors `onSelectionGroup`.
- `onStateChange(state)` — fires for every lifecycle state transition
  (`phase` + `message`). Use it to drive a loading indicator and `aria-busy`.
- `onError(error)` — fires when `createSomakine` rejects for a reason other than
  unmounting (for example WebGL initialization failure or an asset hash
  mismatch). Aborts caused by unmount are swallowed.

Visibility operations (`setLayer`, `setVisible`, `focusStructure`, `focusRegion`,
`showBody`, `reset`) clear highlighting **without** emitting a selection
callback — clear your selection UI when you call them.

## Lifecycle and remounting

The viewer is created in a mount `useEffect` and disposed in its cleanup. An
`AbortController` cancels in-flight creation on unmount and on React Strict Mode
re-invocation, so the component is safe under double-invoke.

Creation-time props (`dataset`, `background`, `initialViewDirection`,
`initialViewUp`, `assetResolver`, `locale`) are read when the viewer is created.
To change any of them, remount the component — for example by changing its
`key`. Callback props are forwarded through a ref, so they can change between
renders without recreating the viewer.

For live changes that do not require remounting, use the imperative handle
(`setLocale`, `setInteractionMode`, selection and visibility methods).
