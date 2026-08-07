# Developer guide

This guide is the entry point for application developers who want to *call*
Somakine. It explains how to install the packages, load a data pack, query the
anatomy, render it in the browser, react to interaction, and compose developer
data — with runnable examples for every step.

For the conceptual model (why anatomy, representation, and product content are
kept separate) read [Architecture](ARCHITECTURE.md) and the
[data-pack schema](SCHEMA.md). For function-by-function detail, jump to the
per-package references:

- [`@somakine/core`](api/core.md) — catalog queries, validation, composition
- [`@somakine/viewer`](api/viewer.md) — Three.js viewer
- [`@somakine/cli`](api/cli.md) — `soma` command-line tool
- [`@somakine/bodyparts3d`](api/bodyparts3d.md) — BodyParts3D pack adapter
- [Published data packs](api/data-packs.md) — starter and BodyParts3D pack exports

## Table of contents

- [Mental model](#mental-model)
- [Installation](#installation)
- [The five-minute application](#the-five-minute-application)
- [Recipes](#recipes)
  - [Load and validate a data pack](#load-and-validate-a-data-pack)
  - [Query the catalog](#query-the-catalog)
  - [Render the viewer](#render-the-viewer)
  - [Handle selection](#handle-selection)
  - [Style structures](#style-structures)
  - [Control layers and visibility](#control-layers-and-visibility)
  - [Control the camera and interaction](#control-the-camera-and-interaction)
  - [Load real GLB assets](#load-real-glb-assets)
  - [Compose developer data](#compose-developer-data)
  - [Handle validation errors](#handle-validation-errors)
  - [Dispose the viewer](#dispose-the-viewer)
- [Package roles](#package-roles)
- [Published data-pack exports](#published-data-pack-exports)

## Mental model

Three layers stack cleanly, and each one only talks to the one below it:

```text
data pack                @somakine/core          @somakine/viewer         your app
(JSON / TS)   → validate & index  →   render & emit events   →   UI, routes, content
```

- A **data pack** (`DataPack`) is a validated JSON/TypeScript document that
  describes structures, regions, relations, visual coverage, mesh instances,
  assets, provenance, and localized labels.
- **`@somakine/core`** validates the pack and exposes an immutable, indexed
  `SomakineCatalog` you query with semantic IDs. It has no DOM, renderer, or
  filesystem dependency, so it runs in any JavaScript environment.
- **`@somakine/viewer`** renders a pack into a Three.js canvas, handles loading,
  picking, focus, and disposal, and emits semantic events. It owns only the
  canvas — you own the surrounding markup, panels, and content.
- **Your application** wires the catalog and viewer into routes, search,
  accessibility wording, and learning or fitness content.

Everything you address by ID — a structure, region, relation, representation,
mesh instance, or asset — uses a namespaced Somakine ID such as
`somakine:structure:femur`. Those IDs are the stable contract between layers.

## Installation

The packages are published separately so you only take what you need. Somakine
targets Node.js `>= 20` and modern browsers.

```sh
# Render the starter pack (synthetic shapes, no asset loader required)
npm install @somakine/viewer @somakine/musculoskeletal-basic three

# Render verified BodyParts3D geometry instead
npm install @somakine/viewer @somakine/bodyparts3d-musculoskeletal three

# Server-side validation, inspection, and composition only (no viewer)
npm install @somakine/core @somakine/cli
```

`three` is a peer dependency of the viewer and must be installed by the host
application. `@somakine/core` is pulled in automatically by the other packages,
but you can install it directly when you want catalog/validation without a
renderer.

## The five-minute application

This is the smallest useful Somakine app: a container, the synthetic pack, a
selection callback, and two viewer calls.

```html
<div id="viewer" style="height: 32rem"></div>
```

```ts
import { createSomakine } from "@somakine/viewer";
import { musculoskeletalBasic } from "@somakine/musculoskeletal-basic";

const container = document.querySelector<HTMLElement>("#viewer");
if (!container) throw new Error("Missing #viewer");

const viewer = await createSomakine(container, {
  dataset: musculoskeletalBasic,
  accessibleLabel: "Somakine anatomy model",
  onSelection(selection) {
    console.log("selected", selection.label, selection.structure.id);
  },
});

viewer.setLayer("bone");
viewer.selectStructure("somakine:structure:femur");
```

That is the whole loop: pass a `DataPack`, receive a `SomakineViewer`, drive it
with semantic commands, and react to callbacks. The rest of this guide expands
each piece.

## Recipes

### Load and validate a data pack

You usually receive a published `DataPack` value generated from checked source
data (for example `musculoskeletalBasic` or `bodyParts3DMusculoskeletal`). The
catalog and viewer validate it when loaded; when you load a pack from a file or
untrusted source, validate it explicitly first:

```ts
import { validateDataPack, assertDataPack, SomakineCatalog } from "@somakine/core";
import type { DataPack } from "@somakine/core";

const response = await fetch("/packs/musculoskeletal.json");
const value: unknown = await response.json();

// Soft check: inspect issues without throwing.
const result = validateDataPack(value);
if (!result.valid) {
  console.warn("pack rejected", result.issues);
  return;
}

// Hard check: throws DataPackValidationError if anything is wrong.
assertDataPack(value); // narrows `value` to DataPack

// Constructing a catalog also validates and deep-freezes the input.
const catalog = new SomakineCatalog(value as DataPack);
```

`validateDataPack` returns every issue (code, JSON path, message); use it when
you want to surface errors to a user. `assertDataPack` throws and also acts as a
TypeScript narrowing assertion. `new SomakineCatalog(pack)` validates again and
isolates you from the input object (it clones and freezes the pack). See
[Handling validation errors](#handle-validation-errors) and the
[core reference](api/core.md#validation).

### Query the catalog

The catalog is your read API over a validated pack. The catalog stores a frozen,
isolated copy of the input pack. Collection methods expose TypeScript
`readonly` results; most returned arrays and search-result objects are new
values, while `relations()` returns a frozen indexed array for known IDs (and an
empty array for unknown IDs). Mutating any returned collection does not mutate
the catalog.

```ts
import { SomakineCatalog } from "@somakine/core";

const catalog = new SomakineCatalog(pack);
const locale = "en";

// Regions in display order.
for (const region of catalog.regions()) {
  console.log(catalog.label(region.id, locale), region.id);
}

// Structures, optionally filtered by region and/or type.
const bones = catalog.structures({ type: "bone" });
const kneeBones = catalog.structures({ regionId: "somakine:region:knee", type: "bone" });

// Resolve a single structure and its visual coverage.
const femur = catalog.structure("somakine:structure:femur");
const coverage = catalog.representation("somakine:structure:femur")?.mode; // "direct"
const instances = catalog.instancesFor("somakine:structure:femur");

// Anatomy relationships for a structure.
const related = catalog.relations("somakine:structure:femur");

// Localized labels fall back to English; aliases use the requested locale only.
const label = catalog.label("somakine:structure:femur", "zh-CN"); // "股骨"
const aliases = catalog.aliases("somakine:structure:anterior-cruciate-ligament", "en"); // ["ACL"]

// Free-text search across labels, aliases, and external IDs.
const hits = catalog.search("ACL", "en");

// Coverage summary and context resolution.
const summary = catalog.coverage(); // { direct, compound, context, unavailable }
const context = catalog.contextFor("somakine:structure:patellar-tendon"); // related structures
```

Label resolution falls back from the requested locale to `"en"` and finally to
the raw ID, so `catalog.label(id, locale)` never throws. See the
[core reference](api/core.md#somakinecatalog) for the full method list and return types.

### Render the viewer

`createSomakine(container, options)` is the single entry point. It loads direct
and compound geometry, frames the model, and resolves once the scene is ready.
Only `dataset` and `accessibleLabel` are required.

```ts
import { createSomakine } from "@somakine/viewer";

const viewer = await createSomakine(container, {
  dataset: pack,
  accessibleLabel: "Interactive anatomy model",
  locale: "en",
  background: null, // let the host surface show through
  onStateChange(state) {
    // state.phase: "loading" | "ready" | "selected" | "empty" | "error" | "disposed"
    spinner.hidden = state.phase !== "loading";
  },
});
```

The returned `viewer` is the imperative API. See
[viewer reference](api/viewer.md#createsomakinecontainer-options) for every option.

### Handle selection

Picking a structure (by click or by code) emits callbacks carrying a
`ViewerSelection`: the structure, its localized label, its coverage mode, the
context structures used when coverage is `context`, and which `side` of a paired
structure was selected.

```ts
const viewer = await createSomakine(container, {
  dataset: pack,
  accessibleLabel: "Interactive anatomy model",
  onSelection(selection) {
    // Fires for single-structure selections (programmatic or click).
    panel.title.textContent = selection.side === "left" || selection.side === "right"
      ? `${selection.side === "left" ? "Left " : "Right "}${selection.label}`
      : selection.label;
    panel.id.textContent = selection.structure.id;
    panel.coverage.textContent = selection.coverage;
  },
  onSelectionGroup(selections) {
    // Fires for selection changes, including multi-select and explicit clears.
    // Visibility operations clear highlighting without this callback; focusStructure
    // is the selection-oriented exception and announces its target.
    panel.count.textContent = `${selections.length} selected`;
  },
});

// Programmatic selection keeps the current visibility set.
viewer.selectStructure("somakine:structure:femur");
viewer.selectStructure("somakine:structure:femur", { side: "left" }); // one side
viewer.selectStructures(["somakine:structure:femur", "somakine:structure:humerus"]);
// Mixed sides in a single call:
viewer.selectStructures([
  { id: "somakine:structure:femur", side: "left" },
  { id: "somakine:structure:humerus", side: "right" },
]);
```

Clicking the canvas highlights only the raycast mesh (side-aware), while
Ctrl-click or Cmd-click toggles additional meshes. Programmatic selection,
focus, visibility, and styling accept an optional `{ side }` to target one side
of a paired structure; without it they operate on the whole semantic structure,
which may include bilateral geometry. IDs that do not resolve are omitted; if a
programmatic selection resolves none, it clears the current highlight and emits
an empty selection group. See
[selection types](api/viewer.md#viewerselection--viewerselectiongroup).

### Style structures

Apply a per-structure material style — colour, emissive treatment, opacity, and
surface parameters — and clear it by passing `null`. A `{ side }` option styles
one side of a paired structure, overriding the structure's base style.

```ts
// Tint the femur and make it slightly translucent.
viewer.setStructureStyle("somakine:structure:femur", {
  color: "#bf7a5a",
  emissive: "#3a1610",
  emissiveIntensity: 0.25,
  opacity: 0.85,
  transparent: true,
  roughness: 0.6,
  metalness: 0.05,
});

// Style only the left side; clear it with the same { side }.
viewer.setStructureStyle("somakine:structure:femur", { color: "#e19a5b" }, { side: "left" });
viewer.setStructureStyle("somakine:structure:femur", null, { side: "left" });

// Revert to the original material captured when the viewer first styled it.
viewer.setStructureStyle("somakine:structure:femur", null);
```

The viewer captures each material's base style when it first applies an
appearance and restores it on `null`. Each style call replaces the previous
override; omitted fields return to the captured base style. An opacity below `1`
automatically enables transparency when `transparent` is omitted. Selection
highlighting always wins while a structure is picked. See
[`StructureStyle`](api/viewer.md#structurestyle).

### Control layers and visibility

Layer, focus, and arbitrary visibility commands all update the same visibility
set; they are not intersecting filters. Call the operation that describes the
view you want last.

```ts
// Layer: show only one anatomical type (null = all).
viewer.setLayer("bone");
viewer.setLayer(null); // everything

// Focus: isolate one structure (or its declared context structures) and frame it.
viewer.focusStructure("somakine:structure:femur");
viewer.focusRegion("somakine:region:knee");

// Arbitrary visibility: show exactly these structures, hide everything else.
viewer.setVisible([
  "somakine:structure:femur",
  "somakine:structure:humerus",
]);

// Return to the whole-body view.
viewer.showBody();
viewer.reset(); // also restores the initial camera
```

`setLayer`, `setVisible`, and `focusRegion` replace the current visibility set,
clear highlighting without emitting a selection callback, and re-frame the
visible bounds. `focusStructure` is the exception: it isolates the target and
announces it through the selection callbacks. See
[viewer methods](api/viewer.md#somakineviewer-methods).

### Control the camera and interaction

The viewer calculates camera framing and orbit limits from the visible bounds,
so you rarely touch the camera directly. You do control the view orientation
(for packs with a non-default axis) and the primary drag behaviour.

```ts
const viewer = await createSomakine(container, {
  dataset: pack,
  accessibleLabel: "Interactive anatomy model",
  // BodyParts3D is Z-up after Three.js' glTF coordinate conversion.
  initialViewDirection: [0, -1, 0.18],
  initialViewUp: [0, 0, 1],
});

// Toggle the primary mouse drag between rotate and pan.
viewer.setInteractionMode("pan");
viewer.setInteractionMode("rotate");

// Change locale; subsequent labels and messages use it.
viewer.setLocale("zh-CN");
```

The secondary drag always keeps the opposite operation available, so the canvas
stays useful in either mode. See
[options](api/viewer.md#createsomakineoptions) and
[methods](api/viewer.md#somakineviewer-methods).

### Load real GLB assets

The synthetic pack uses generated primitives, so it needs no loader. Verified
geometry packs (BodyParts3D) reference self-contained binary GLB files through
`assetResolver`, which you own so you can map asset IDs to package URLs, local
files, or authenticated storage.

```ts
import { createSomakine } from "@somakine/viewer";
import { bodyParts3DMusculoskeletal } from "@somakine/bodyparts3d-musculoskeletal";
import type { AssetResolver } from "@somakine/viewer";

// Map each asset's relative URI to a bundler-resolved URL.
const assetResolver: AssetResolver = async (asset, signal) => {
  // `asset.uri` already includes its relative `assets/...` path. A real app can
  // replace this URL construction with its bundler's package-asset map.
  const url = new URL(asset.uri, import.meta.url);
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`asset ${asset.id} failed (${response.status})`);
  return response.arrayBuffer();
};

const viewer = await createSomakine(container, {
  dataset: bodyParts3DMusculoskeletal,
  accessibleLabel: "Interactive BodyParts3D model",
  assetResolver,
});
```

Regardless of where bytes come from, the viewer verifies each asset's declared
byte count and SHA-256 digest before parsing, and rejects GLB files that contain
external or data URIs. The default resolver only accepts `model/gltf-binary`
assets fetched over the network. See
[`AssetResolver`](api/viewer.md#assetresolver) and
[asset helpers](api/viewer.md#asset-helpers).

### Compose developer data

Ship a small `DataExtension` next to your product and compose it onto a verified
base pack before creating the viewer. The result is an ordinary `DataPack`.

```ts
import { composeDataPacks } from "@somakine/core";
import { createSomakine } from "@somakine/viewer";

const { dataset, report } = composeDataPacks(basePack, [kneeExtension], {
  conflictPolicy: "fill-unavailable",
});

console.log("added", report.addedStructureIds, "replaced", report.replacedRepresentationIds);

const viewer = await createSomakine(container, {
  dataset,
  accessibleLabel: "Interactive body model",
  assetResolver,
});
```

The default `fill-unavailable` policy fills unavailable or contextual coverage but
never silently replaces reviewed direct geometry. See
[developer data extensions](DATA_EXTENSIONS.md) and the
[composition reference](api/core.md#composition).

### Handle validation errors

Validation produces structured issues, each with a machine-readable `code`, a
JSON `path`, and a human-readable `message`. Catch the typed errors or read the
issue list directly.

```ts
import {
  validateDataPack,
  assertDataPack,
  DataPackValidationError,
} from "@somakine/core";

const result = validateDataPack(unknownValue);
if (!result.valid) {
  for (const issue of result.issues) {
    console.warn(`${issue.code} at ${issue.path}: ${issue.message}`);
  }
}

try {
  assertDataPack(unknownValue);
} catch (error) {
  if (error instanceof DataPackValidationError) {
    showFormErrors(error.issues);
  } else throw error;
}
```

Codes include `invalid_type`, `invalid_value`, `invalid_id`, `duplicate_id`,
`broken_reference`, `missing_provenance`, `unsafe_asset_uri`,
`invalid_coverage`, `invalid_laterality`, `invalid_extension`,
`extension_conflict`, and `unsupported_schema`. See the
[errors reference](api/core.md#errors).

### Dispose the viewer

The viewer holds GPU resources, event listeners, and observers. Dispose it when
the host removes the container (for example, on route change or unmount).

```ts
viewer.dispose();
```

`dispose()` aborts in-flight loads, disconnects the `ResizeObserver`, releases
the OrbitControls, disposes every mesh geometry/material/texture, forces WebGL
context loss, removes the canvas, and emits a final
`onStateChange({ phase: "disposed" })`. It is idempotent; other viewer methods
throw after disposal. Pass an `AbortSignal` to `createSomakine` to cancel
initialization itself.

## Package roles

| Package | Role | Depends on |
| --- | --- | --- |
| `@somakine/core` | Types, validation, catalog, composition | nothing runtime |
| `@somakine/viewer` | Three.js rendering and interaction | `@somakine/core`, `three` (peer) |
| `@somakine/bodyparts3d` | BodyParts3D provenance + pack builder | `@somakine/core` |
| `@somakine/cli` | `soma` validation, inspection, composition CLI | `@somakine/core` |
| `@somakine/musculoskeletal-basic` | Synthetic alpha fixture | `@somakine/core` |
| `@somakine/bodyparts3d-musculoskeletal` | Verified BodyParts3D 4.0 geometry | `@somakine/core` |

`@somakine/bodyparts3d` is an adapter, not a privileged core dependency — a
second anatomy source must satisfy the same core contract without changing core
types. See [Architecture](ARCHITECTURE.md) for the boundary rules.

## Published data-pack exports

The data-pack packages export data rather than renderer functions. The starter
pack exposes `musculoskeletalBasic`. The verified BodyParts3D pack exposes
`bodyParts3DMusculoskeletal` and a TypeScript-readonly build summary:

```ts
import {
  bodyParts3DMusculoskeletal,
  bodyParts3DMusculoskeletalStats,
} from "@somakine/bodyparts3d-musculoskeletal";

bodyParts3DMusculoskeletalStats;
// {
//   regions: 8,
//   structures: 180,
//   assets: 15,
//   coverage: { direct: 151, compound: 4, context: 0, unavailable: 25 },
// }
```

The summary is build metadata; use the `DataPack` and `SomakineCatalog` APIs for
runtime queries and coverage calculations.
