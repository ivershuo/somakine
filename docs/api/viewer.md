# `@somakine/viewer` API reference

```sh
npm install @somakine/core @somakine/viewer three
```

A framework-neutral Three.js viewer for Somakine data packs. It owns the canvas,
scene, verified asset loading, picking, focus, and resource disposal. The host
application owns the surrounding markup, controls, navigation, and content.

`three` is a **peer dependency** and must be installed by the host application.

- [`createSomakine(container, options)`](#createsomakinecontainer-options)
- [Options and types](#options-and-types)
  - [`CreateSomakineOptions`](#createsomakineoptions)
  - [`AssetResolver`](#assetresolver)
  - [`ViewerSelection` / `ViewerSelectionGroup`](#viewerselection--viewerselectiongroup)
  - [`ViewerState` / `ViewerPhase`](#viewerstate--viewerphase)
  - [`StructureStyle`](#structurestyle)
  - [`InteractionMode`](#interactionmode)
  - [`SomakineViewer`](#somakineviewer)
  - [`SomakineViewer` methods](#somakineviewer-methods)
- [Camera helpers](#camera-helpers)
- [Asset helpers](#asset-helpers)

## `createSomakine(container, options)`

```ts
function createSomakine(
  container: HTMLElement,
  options: CreateSomakineOptions,
): Promise<SomakineViewer>
```

The single entry point. Validates the dataset via `SomakineCatalog`, creates a
canvas inside `container`, loads every direct and compound structure, frames the
model, and resolves to a `SomakineViewer` once the scene is ready.

- Throws `TypeError` if `container` is not an `HTMLElement` or `accessibleLabel`
  is empty.
- Throws an `AbortError` (DOMException) immediately if `options.signal` is
  already aborted.
- During initialization it emits `onStateChange({ phase: "loading" })`. A
  successful initialization ends in `ready`; a pack with no direct or compound
  geometry may briefly emit `empty` while it is being framed. WebGL renderer
  initialization emits `error`. Asset or other loading failures dispose the
  partially-created viewer (emitting `disposed`) and reject the promise, so the
  caller should handle the rejected `createSomakine()` call.

The container must have an explicit height (for example `style="height: 32rem"`);
the canvas fills 100% of it.

```ts
import { createSomakine } from "@somakine/viewer";
import { musculoskeletalBasic } from "@somakine/musculoskeletal-basic";

const viewer = await createSomakine(container, {
  dataset: musculoskeletalBasic,
  accessibleLabel: "Somakine anatomy model",
  onSelection(selection) {
    console.log(selection.label, selection.structure.id);
  },
});
```

The canvas is focusable (`tabIndex = 0`), exposes `role="img"`, and is labelled
with `accessibleLabel`. Connect keyboard pan/zoom hints and
`aria-describedby` from the host as needed.

## Options and types

### `CreateSomakineOptions`

```ts
interface CreateSomakineOptions {
  dataset: DataPack;
  accessibleLabel: string;
  locale?: string;                          // default "en"
  initialViewDirection?: readonly [number, number, number];
  initialViewUp?: readonly [number, number, number];
  signal?: AbortSignal;
  assetResolver?: AssetResolver;
  onSelection?: (selection: ViewerSelection) => void;
  onSelectionGroup?: (selections: ViewerSelectionGroup) => void;
  onStateChange?: (state: ViewerState) => void;
  background?: string | null;
}
```

| Option | Description |
| --- | --- |
| `dataset` | A validated `DataPack` from `@somakine/core` or a published pack. |
| `accessibleLabel` | Required. Sets the canvas `aria-label`; must be non-empty. |
| `locale` | Initial locale for labels and messages. Defaults to `"en"`. |
| `initialViewDirection` | Initial camera direction in the pack's coordinate system. Defaults to `[0, 0.2, 1]`. |
| `initialViewUp` | Up axis used by `OrbitControls`. Defaults to `[0, 1, 0]`. Pass a non-parallel vector for Z-up packs (for example `[0, 0, 1]` for BodyParts3D). |
| `signal` | Abort the entire initialization. An aborted init disposes everything and rejects with `AbortError`. |
| `assetResolver` | Custom GLB byte loader. Falls back to `defaultAssetResolver`. |
| `onSelection` | Fires for single-structure selections (programmatic or click). |
| `onSelectionGroup` | Fires for canvas/programmatic selection changes and receives the complete group. An empty group is emitted when `selectStructures([])` clears the selection or Ctrl/Cmd-click removes the last picked mesh; visibility, layer, focus, and reset operations clear highlighting without emitting a selection callback. |
| `onStateChange` | Lifecycle/state updates for spinners, status text, and `aria-busy`. |
| `background` | Canvas clear colour as a hex string. Pass `null` to make the canvas transparent so the host surface shows through. Defaults to a dark teal (`#0f1717`). |

`initialViewDirection` and `initialViewUp` are normalized and validated; a
non-finite or zero vector falls back to the default, and an up vector parallel
to the direction is auto-corrected.

### `AssetResolver`

```ts
type AssetResolver = (asset: GltfAsset, signal: AbortSignal) => Promise<ArrayBuffer>;
```

A host-owned function that returns the raw bytes for a `GltfAsset`. The viewer
verifies the returned bytes against the asset's declared `bytes` and `sha256`
before parsing, so the resolver controls *where* bytes come from (package URL,
local `File`, authenticated storage) while Somakine controls *whether* they are
trusted. Throwing or aborting via `signal` cancels loading.

```ts
const assetResolver: AssetResolver = async (asset, signal) => {
  // `asset.uri` is already a safe relative path (for example,
  // `assets/bodyparts3d/ankle-foot.glb`). Replace this with your bundler's
  // package-asset map when the files are emitted somewhere else.
  const url = new URL(asset.uri, import.meta.url);
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`asset ${asset.id} failed (${response.status})`);
  return response.arrayBuffer();
};
```

If omitted, [`defaultAssetResolver`](#defaultassetresolverasset-signal) is used.

### `ViewerSelection` / `ViewerSelectionGroup`

```ts
interface ViewerSelection {
  structure: Structure;            // the canonical structure record
  label: string;                   // localized label for the active locale
  coverage: CoverageMode;          // the representation's coverage mode
  contextStructureIds: readonly StructureId[]; // non-empty only for context mode
}

type ViewerSelectionGroup = readonly ViewerSelection[];
```

`onSelection` receives a single `ViewerSelection` for one-structure selections.
`onSelectionGroup` receives the full group (one entry for a single selection,
many for multi-select, and an empty group when an explicit selection operation
clears the selection). When exactly one structure is selected, both fire; for
multi-select only `onSelectionGroup` fires with more than one entry. Operations
that change visibility, such as `setLayer`, `focusRegion`, `setVisible`,
`showBody`, and `reset`, clear highlighting without emitting these selection
callbacks.

### `ViewerState` / `ViewerPhase`

```ts
type ViewerPhase = "loading" | "ready" | "selected" | "empty" | "error" | "disposed";

interface ViewerState {
  phase: ViewerPhase;
  message: string;
}
```

`onStateChange` is the primary hook for status UI. `message` is a short string;
labels inserted into selection and region messages use the active locale, while
the built-in status phrases are currently English (for example `Anatomy ready`,
`Bone layer`, `5 structures selected`, and `No visible geometry`). `loading` maps
naturally to `aria-busy="true"`; `disposed` is the final emission before the
canvas is removed.

### `StructureStyle`

```ts
interface StructureStyle {
  color?: string;             // #rrggbb
  emissive?: string;          // #rrggbb, applied when not selected
  emissiveIntensity?: number; // finite, >= 0
  opacity?: number;           // 0..1
  transparent?: boolean;
  roughness?: number;         // 0..1
  metalness?: number;         // 0..1
}
```

A per-structure material override applied by `setStructureStyle`. All fields are
optional. Each call replaces the previous override; omitted fields fall back to
the material's captured base style rather than merging with an earlier override.
`color` and `emissive` must be six-digit hex values. `emissiveIntensity` must be
finite and non-negative, while `opacity`, `roughness`, and `metalness` must be
within `0..1`; invalid values throw `TypeError` rather than being clamped. When
an opacity below `1` is supplied without an explicit `transparent` value, the
viewer enables transparency for that appearance.
Selection highlighting overrides the style while a structure is picked and is
removed when the selection clears.

### `InteractionMode`

```ts
type InteractionMode = "rotate" | "pan";
```

The primary mouse-drag behaviour. The secondary drag always keeps the opposite
operation available (right-drag), so the canvas is useful in either mode without
a modifier key. See [`setInteractionMode`](#setinteractionmodemode).

### `SomakineViewer`

```ts
interface SomakineViewer {
  readonly canvas: HTMLCanvasElement;
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
  dispose(): void;
}
```

### `SomakineViewer` methods

Every method except `dispose()` throws `"Somakine viewer is disposed"` after
`dispose()` is called. `dispose()` itself is idempotent.

#### `.canvas`

```ts
readonly canvas: HTMLCanvasElement
```

The viewer-owned canvas. The host may set additional ARIA attributes (such as
`aria-describedby`) and focus it, but should not reparent or restyle it in ways
that fight the viewer's sizing.

#### `.setLocale(locale)`

```ts
setLocale(locale: string): void
```

Changes the active locale. Subsequent selection messages, focus labels, and any
re-rendered labels use it. Throws if `locale` is empty. Does not re-emit a
selection; call `selectStructure` again to refresh a panel.

```ts
viewer.setLocale("zh-CN");
```

#### `.setInteractionMode(mode)`

```ts
setInteractionMode(mode: InteractionMode): void
```

Sets the primary drag to rotate or pan; the secondary drag keeps the opposite
operation. Re-renders immediately. Use it to keep your on-screen drag hint in
sync (for example "drag to rotate, right-drag to pan" vs. the inverse).

#### `.setLayer(type)`

```ts
setLayer(type: StructureType | null): void
```

Shows only structures of one anatomical type, or all structures when `null`.
Clears the current highlight, replaces the current visibility set, re-frames the
visible bounds, and emits a state message such as `"bone layer"` (or `"No direct
bone geometry"` for an `empty` result). This is a visibility operation rather
than a persistent filter; later calls to `setVisible`, `focus*`, or `showBody`
replace its result.

```ts
viewer.setLayer("bone");
viewer.setLayer(null); // everything
```

#### `.selectStructure(id)`

```ts
selectStructure(id: StructureId): void
```

Selects one structure, keeping the current visibility set and applying the
selection style. Equivalent to `selectStructures([id])`. Emits `onSelection` and
`onSelectionGroup` when the ID resolves. An unknown ID resolves to an empty
selection, clearing the current highlight and emitting an empty group. Operates
on the semantic structure, which may include bilateral geometry.

#### `.selectStructures(ids)`

```ts
selectStructures(ids: readonly StructureId[]): void
```

Selects any set of structures. IDs are deduplicated and unknown IDs are omitted;
if none resolve (including an empty list), the current highlight is cleared and
an empty group is emitted. The IDs need not share a region. Emits
`onSelectionGroup` (and `onSelection` when exactly one resolves). Keeps the
current visibility set.

```ts
viewer.selectStructures(["somakine:structure:femur", "somakine:structure:humerus"]);
```

#### `.focusStructure(id)`

```ts
focusStructure(id: StructureId): void
```

The explicit isolation operation: shows only the selected direct/compound
structure (or, for `context` mode, its declared context structures), highlights
it, frames it, and announces the selection. Use it when a caller wants only that
structure visible, in contrast to `selectStructure` which keeps the current set.
An unknown ID is ignored without changing the current visibility or highlight.

#### `.focusRegion(id)`

```ts
focusRegion(id: RegionId): void
```

Shows only the structures in a region, frames them, and emits a state message
with the region's localized label. Emits `empty` if the region has no direct
geometry.

#### `.setVisible(ids)`

```ts
setVisible(ids: readonly StructureId[]): void
```

Shows exactly the listed structures and hides everything else, then re-frames.
Use this for arbitrary visibility (for example, a search-result view) that does
not map to a single type or region.

```ts
viewer.setVisible(catalog.structures({ type: "bone" }).map((s) => s.id));
```

#### `.setStructureStyle(id, style)`

```ts
setStructureStyle(id: StructureId, style: StructureStyle | null): void
```

Applies (or, with `null`, clears) a per-structure material style. The viewer
captures each compatible material's base style when it first applies an
appearance and restores it on `null`. Each call replaces the previous override;
omitted fields fall back to the captured base style. A no-op if the structure
has no group (for example, an `unavailable` structure).

```ts
viewer.setStructureStyle("somakine:structure:femur", {
  color: "#bf7a5a", opacity: 0.85, transparent: true,
});
viewer.setStructureStyle("somakine:structure:femur", null); // restore
```

#### `.showBody()`

```ts
showBody(): void
```

Restores the whole-body view: every loaded structure is made visible, the current
highlight is cleared, and the visible bounds are framed. Framing may move the
camera; use `reset()` when you also want the initial camera position and target.

#### `.reset()`

```ts
reset(): void
```

`showBody()` plus a return to the initial camera position and target captured at
load. Use this for a "reset view" control.

#### `.dispose()`

```ts
dispose(): void
```

Tears down everything: aborts in-flight loads, disconnects the `ResizeObserver`,
releases `OrbitControls`, disposes every mesh geometry/material/texture, forces
WebGL context loss, removes the canvas, and emits a final
`onStateChange({ phase: "disposed" })`. It is idempotent; other viewer methods
throw after disposal. Call this on host unmount or route change.

## Camera helpers

These keep camera math deterministic and testable outside the renderer.

```ts
import { calculateViewFit, normalizeViewVector } from "@somakine/viewer";
```

### `calculateViewFit(radius, fovDegrees, aspect?, padding?)`

```ts
interface ViewFit {
  distance: number;
  minDistance: number;
  maxDistance: number;
  near: number;
  far: number;
}

function calculateViewFit(
  radius: number,
  fovDegrees: number,
  aspect?: number,   // default 1
  padding?: number,  // default 1.2, must be > 1
): ViewFit
```

Computes camera distance and near/far/min/max orbit limits to fit a bounding
sphere. It uses the limiting field of view — vertical on narrow viewports,
horizontal on wide ones — so the model stays framed in both portrait and
landscape. Non-finite or invalid radius/aspect/padding values use safe defaults;
the field of view is sanitized to the supported `1..179` degree range. You rarely
call this directly; the viewer uses it internally on every frame operation.

```ts
const fit = calculateViewFit(sphereRadius, camera.fov, camera.aspect);
// camera.position = center + direction * fit.distance; near = fit.near; ...
```

### `normalizeViewVector(value, fallback)`

```ts
function normalizeViewVector(
  value: readonly [number, number, number] | undefined,
  fallback: readonly [number, number, number],
): readonly [number, number, number]
```

Normalizes a view direction/up vector, substituting `fallback` when `value` is
missing, non-finite, or zero-length. Throws `TypeError` only when the fallback
itself is invalid (a programmer error). Returns a unit vector.

```ts
normalizeViewVector([0, 0, 2], [0, 1, 0]);        // [0, 0, 1]
normalizeViewVector([0, 0, 0], [0, 1, 0]);        // [0, 1, 0] (fallback)
normalizeViewVector([NaN, 0, 0], [0, 0, 1]);      // [0, 0, 1] (fallback)
```

## Asset helpers

The viewer exposes the same low-level helpers it uses internally, so hosts and
tooling can verify assets consistently. Import them from `@somakine/viewer`.

```ts
import {
  createPrimitiveObject, defaultAssetResolver, verifyAssetBytes,
  assertSelfContainedGlb, findGltfNode, disposeObject3D,
} from "@somakine/viewer";
```

### `createPrimitiveObject(asset)`

```ts
function createPrimitiveObject(asset: PrimitiveAsset): THREE.Object3D
```

Builds a disposable Three.js mesh for a `PrimitiveAsset`: `box`, `sphere`,
`cylinder`, or `capsule` from `asset.primitive.dimensions` and `color`. Used by
the viewer for synthetic packs and useful in tests or previews.

### `defaultAssetResolver(asset, signal)`

```ts
function defaultAssetResolver(asset: GltfAsset, signal: AbortSignal): Promise<ArrayBuffer>
```

The fallback resolver used when `options.assetResolver` is omitted. Accepts
`model/gltf-binary` assets only, rejects assets above `SOMAKINE_MAX_ASSET_BYTES`,
fetches with `credentials: "omit"` and `redirect: "error"`, validates the
`Content-Length` header when present, and streams into a buffer exactly
`asset.bytes` long. Throwing aborts loading. Provide your own resolver for
package URLs, local files, or authenticated storage.

### `verifyAssetBytes(asset, bytes)`

```ts
function verifyAssetBytes(asset: GltfAsset, bytes: ArrayBuffer): Promise<void>
```

Rejects assets above the runtime byte limit, checks `bytes.byteLength === asset.bytes`,
and recomputes the SHA-256 digest to compare against `asset.sha256`. Throws on
any mismatch. The viewer calls this on every resolved asset before parsing.

```ts
await verifyAssetBytes(asset, buffer); // throws on length or digest mismatch
```

### `assertSelfContainedGlb(bytes)`

```ts
function assertSelfContainedGlb(bytes: ArrayBuffer): void
```

Validates a GLB header (magic, version 2, declared length, JSON chunk) and
rejects any document containing an external or data `uri` anywhere in the glTF
JSON (images, buffers, etc.). The viewer calls this before parsing so a GLB
cannot secretly fetch from the network. Throws with a descriptive message on
failure.

### `findGltfNode(root, sourceName)`

```ts
function findGltfNode(root: THREE.Object3D, sourceName: string): THREE.Object3D | undefined
```

Resolves a `node-name` mesh selector, looking up `sourceName` directly and then
under its Three.js-sanitized form (glTF permits names like `head-neck:atlas`
that Three.js rewrites). Returns `undefined` when no matching node exists.

```ts
const node = findGltfNode(gltfScene, "head-neck:atlas");
```

### `disposeObject3D(root)`

```ts
function disposeObject3D(root: THREE.Object3D): void
```

Recursively disposes every mesh geometry, material, and material texture under
`root`. Used by the viewer on disposal and on the transient source scenes created
during loading; useful when you build your own Three.js objects from Somakine
assets.

## Re-exports

The viewer re-exports `Asset` from `@somakine/core` for convenience:

```ts
import type { Asset } from "@somakine/viewer";
```
