# `@somakine/core` API reference

```sh
npm install @somakine/core
```

Framework-neutral domain types, strict data-pack validation, immutable catalog
indexes, localized labels, search, coverage queries, and data-extension
composition. This package has no DOM, renderer, filesystem, network, or
clinical-content dependency — it runs in any modern JavaScript environment.

- [Constants](#constants)
- [Types](#types)
- [`SomakineCatalog`](#somakinecatalog)
  - [`new SomakineCatalog(pack)`](#new-somakinecatalogpack)
  - [`.pack`](#pack)
  - [`.regions()`](#regions)
  - [`.structures(options)`](#structuresoptions)
  - [`.structure(id)`](#structureid)
  - [`.region(id)`](#regionid)
  - [`.representation(id)`](#representationid)
  - [`.instancesFor(id)`](#instancesforid)
  - [`.asset(id)`](#assetid)
  - [`.relations(id)`](#relationsid)
  - [`.label(id, locale)`](#labelid-locale)
  - [`.aliases(id, locale)`](#aliasesid-locale)
  - [`.search(query, locale, limit)`](#searchquery-locale-limit)
  - [`.coverage()`](#coverage)
  - [`.contextFor(id)`](#contextforid)
- [Validation](#validation)
  - [`validateDataPack(value)`](#validatedatapackvalue)
  - [`assertDataPack(value)`](#assertdatapackvalue)
  - [`isSafeAssetUri(uri)`](#issafeasseturiuri)
  - [`cloneDataPack(pack)`](#clonedatapackpack)
  - [`assetHasRuntimeFile(asset)`](#assethasruntimefileasset)
- [Composition](#composition)
  - [`validateDataExtension(value, base?)`](#validatedataextensionvalue-base)
  - [`assertDataExtension(value, base?)`](#assertdataextensionvalue-base)
  - [`composeDataPacks(base, extensions, options?)`](#composedatapacksbase-extensions-options)
- [Errors](#errors)

## Constants

```ts
import { SOMAKINE_SCHEMA_VERSION, SOMAKINE_MAX_ASSET_BYTES } from "@somakine/core";
```

### `SOMAKINE_SCHEMA_VERSION`

```ts
export const SOMAKINE_SCHEMA_VERSION = "0.1.0";
```

The schema version every data pack and extension must declare in its
`schemaVersion` field. Validation rejects any other value with the
`unsupported_schema` code. The schema version and a pack's own `version` change
independently.

### `SOMAKINE_MAX_ASSET_BYTES`

```ts
export const SOMAKINE_MAX_ASSET_BYTES = 128 * 1024 * 1024; // 128 MiB
```

Hard ceiling on the runtime size of a single GLB asset. Validation rejects a
pack whose asset `bytes` exceeds it (`invalid_value`), and the viewer refuses to
allocate a buffer larger than it before fetching. Use it to enforce the same
budget in your own tooling.

## Types

All types are exported from the package root. The namespaced IDs are template
literal types, so a misplaced ID is a compile-time error.

```ts
import type {
  // Identifiers
  SomakineId, StructureId, RegionId, RelationId,
  RepresentationId, MeshInstanceId, AssetId,
  // Enums
  StructureType, Laterality, RelationType, CoverageMode,
  ReviewState, ExtensionMatch, CompositionConflictPolicy,
  // Registries
  SourceRecord, LicenseRecord,
  // Data model
  Region, Structure, Relation, Transform, PrimitiveDefinition, GeometryBudget,
  PrimitiveAsset, GltfAsset, Asset, MeshSelector, MeshInstance, Representation,
  LocalePack, ExtensionTarget, StructureMapping, DataPack, DataExtension,
  // Query / composition results
  CoverageSummary, CompositionReport, ComposedDataPack, ValidationResult,
} from "@somakine/core";
```

### Identifiers

Every entity is addressed by a namespaced string ID.

| Type | Pattern | Example |
| --- | --- | --- |
| `SomakineId` | `somakine:${string}` | — |
| `StructureId` | `somakine:structure:${string}` | `somakine:structure:femur` |
| `RegionId` | `somakine:region:${string}` | `somakine:region:knee` |
| `RelationId` | `somakine:relation:${string}` | `somakine:relation:acl-part-knee-joint` |
| `RepresentationId` | `somakine:representation:${string}` | `somakine:representation:femur` |
| `MeshInstanceId` | `somakine:instance:${string}` | `somakine:instance:femur-left` |
| `AssetId` | `somakine:asset:${string}` | `somakine:asset:femur` |

ID segments are lowercase letters, digits, and hyphens (`[a-z0-9]+(?:-[a-z0-9]+)*`),
except asset IDs which additionally allow colon-separated segments.

### Enums

```ts
type StructureType = "bone" | "joint" | "ligament" | "muscle" | "tendon" | "skin";
type Laterality = "none" | "paired" | "midline" | "variable";
type RelationType =
  | "part_of" | "articulates_with" | "attaches_to"
  | "originates_from" | "inserts_into" | "crosses" | "contains";
type CoverageMode = "direct" | "compound" | "context" | "unavailable";
type ReviewState = "unreviewed" | "source-reviewed" | "expert-reviewed";
type ExtensionMatch = "exact" | "synonym" | "expert-reviewed";
type CompositionConflictPolicy = "fill-unavailable" | "prefer-extension" | "error-on-conflict";
```

Coverage modes describe what a representation claims about a structure:

- `direct` — target geometry exists (one or more mesh instances).
- `compound` — a reviewed presentation uses two or more mesh instances.
- `context` — the target is missing; related structures may be focused instead.
- `unavailable` — no target or contextual visual is provided.

### Registries

```ts
interface SourceRecord {
  id: string;
  title: string;
  version: string;
  url: string;          // http(s) URL
  retrievedAt: string;  // ISO-8601 UTC timestamp
}

interface LicenseRecord {
  id: string;
  name: string;
  url: string;          // http(s) URL
  attribution: string;
  redistribution: "permissive" | "attribution" | "share-alike" | "restricted";
}
```

### Core records

```ts
interface Region {
  id: RegionId;
  order: number;        // non-negative integer; drives display order
  sourceIds: string[];  // provenance, at least one
}

interface Structure {
  id: StructureId;
  type: StructureType;
  laterality: Laterality;
  regionIds: RegionId[];              // many-to-many with regions
  externalIds: Record<string, string>; // e.g. { "FMA": "24979" }
  sourceIds: string[];
  reviewState: ReviewState;
}

interface Relation {
  id: RelationId;
  type: RelationType;
  sourceId: StructureId;   // cannot equal targetId
  targetId: StructureId;
  sourceIds: string[];
  reviewState: ReviewState;
}

interface Transform {
  position?: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  scale?: readonly [number, number, number]; // positive values
}

interface PrimitiveDefinition {
  shape: "box" | "sphere" | "cylinder" | "capsule";
  dimensions: readonly [number, number, number]; // positive
  color: string; // #rrggbb
}

interface GeometryBudget {
  vertices: number;  // positive integer
  gpuBytes: number;  // positive integer
}
```

### Assets

```ts
interface PrimitiveAsset {
  id: AssetId;
  kind: "primitive";
  primitive: PrimitiveDefinition;
  sourceIds: string[];
  licenseId: string;
}

interface GltfAsset {
  id: AssetId;
  kind: "gltf";
  uri: string;                       // safe relative path (see isSafeAssetUri)
  mediaType: "model/gltf-binary" | "model/gltf+json";
  sha256: string;                    // 64 lowercase hex chars
  bytes: number;                     // <= SOMAKINE_MAX_ASSET_BYTES
  geometry: GeometryBudget;
  sourceIds: string[];
  licenseId: string;
}

type Asset = PrimitiveAsset | GltfAsset;
```

### Mesh instances and representations

```ts
interface MeshSelector {
  kind: "scene" | "node-name";
  value?: string; // required when kind === "node-name"
}

interface MeshInstance {
  id: MeshInstanceId;
  assetId: AssetId;
  laterality: "none" | "left" | "right" | "bilateral";
  selector: MeshSelector;
  transform?: Transform;
}

interface Representation {
  id: RepresentationId;
  structureId: StructureId;
  mode: CoverageMode;
  instanceIds: MeshInstanceId[];       // required for direct/compound; empty otherwise
  contextStructureIds: StructureId[];  // required for context; empty otherwise
  sourceIds: string[];
  reviewState: ReviewState;
}
```

Validation enforces the coverage contract: a `direct`/`compound` representation
must reference mesh instances and no context structures; `compound` needs at
least two instances; `context` needs related structures and no instances;
`unavailable` references no geometry. A structure cannot be its own context.

### Locales

```ts
interface LocalePack {
  locale: string;                        // e.g. "en", "zh-CN"
  labels: Record<string, string>;        // structure/region ID -> label
  aliases: Record<string, string[]>;     // structure/region ID -> aliases
}
```

A base pack must label every region and structure in every locale. Locales carry
labels and aliases only — never educational or clinical prose.

### Data pack and extension

```ts
interface DataPack {
  schemaVersion: typeof SOMAKINE_SCHEMA_VERSION;
  id: string;
  version: string;
  title: string;
  description: string;
  createdAt: string;          // ISO-8601 UTC
  sources: SourceRecord[];    // at least one
  licenses: LicenseRecord[];  // at least one
  regions: Region[];          // at least one
  structures: Structure[];    // at least one
  relations: Relation[];
  assets: Asset[];
  meshInstances: MeshInstance[];
  representations: Representation[];
  locales: LocalePack[];      // at least one
}

interface ExtensionTarget {
  id: string;
  version?: string;
}

interface StructureMapping {
  targetStructureId: StructureId;  // must exist in the base pack
  match: ExtensionMatch;
  confidence: number;              // 0..1
  sourceIds: string[];
  reviewState: ReviewState;
}

interface DataExtension {
  schemaVersion: typeof SOMAKINE_SCHEMA_VERSION;
  id: string;
  version: string;
  title: string;
  description: string;
  createdAt: string;
  namespace: string;          // lowercase, digits, hyphens
  targetPack: ExtensionTarget;
  sources: SourceRecord[];    // at least one
  licenses: LicenseRecord[];  // at least one
  regions: Region[];
  structures: Structure[];
  relations: Relation[];
  assets: Asset[];
  meshInstances: MeshInstance[];
  representations: Representation[];
  locales: LocalePack[];
  mappings: StructureMapping[];
}
```

Extension-owned IDs must be namespaced: a region/structure/relation/instance/
representation owned by the extension begins with `somakine:<kind>:<namespace>-`,
and an owned asset begins with `somakine:asset:<namespace>:`. Existing base-pack
structure IDs may be referenced (through a mapping) but not redefined.

### Query and composition results

```ts
interface CoverageSummary {
  direct: number;
  compound: number;
  context: number;
  unavailable: number;
}

interface CompositionReport {
  basePackId: string;
  extensionIds: readonly string[];
  addedRegionIds: readonly RegionId[];
  addedStructureIds: readonly StructureId[];
  addedRelationIds: readonly RelationId[];
  addedAssetIds: readonly AssetId[];
  addedInstanceIds: readonly MeshInstanceId[];
  replacedRepresentationIds: readonly RepresentationId[];
  deduplicatedRelationIds: readonly RelationId[];
}

interface ComposedDataPack {
  dataset: DataPack;
  report: CompositionReport;
}
```

## `SomakineCatalog`

An immutable, indexed read API over a validated data pack. Constructing a
catalog validates the pack, deep-clones it, and freezes the clone — so callers
cannot mutate the catalog's view of the data, and later mutations to your
original object do not leak in.

The record objects stored by the catalog are frozen. Most collection methods
return new arrays (and `search()` returns new result objects); for a known ID,
`relations()` returns its frozen indexed array (an unknown ID returns an empty
array). Mutating a returned collection does not change the catalog, but arrays
other than a known-ID `relations()` result are not themselves runtime-frozen
values.

```ts
import { SomakineCatalog } from "@somakine/core";
```

### `new SomakineCatalog(pack)`

```ts
constructor(pack: DataPack)
```

Validates `pack` (throws `DataPackValidationError` on failure), clones and
freezes it, and builds lookup indexes.

```ts
const catalog = new SomakineCatalog(pack);
```

### `.pack`

```ts
readonly pack: DataPack
```

The frozen, isolated copy of the input pack.

```ts
catalog.pack.title;            // read OK
catalog.pack.title = "x";      // throws TypeError (frozen)
```

### `.regions()`

```ts
regions(): readonly Region[]
```

All regions, sorted by `order` then `id`. Regions are overlapping views, not a
strict hierarchy.

```ts
for (const region of catalog.regions()) {
  console.log(region.order, catalog.label(region.id, "en"));
}
```

### `.structures(options)`

```ts
structures(options?: { regionId?: RegionId; type?: StructureType }): readonly Structure[]
```

All structures, optionally filtered by region and/or type, sorted by `id`. A
structure can belong to multiple regions.

```ts
catalog.structures();                                       // everything
catalog.structures({ type: "bone" });                       // all bones
catalog.structures({ regionId: "somakine:region:knee" });   // knee structures
catalog.structures({ regionId: "somakine:region:knee", type: "bone" });
```

### `.structure(id)`

```ts
structure(id: StructureId): Structure | null
```

A single structure, or `null` if unknown.

```ts
const femur = catalog.structure("somakine:structure:femur");
if (femur) console.log(femur.type, femur.laterality);
```

### `.region(id)`

```ts
region(id: RegionId): Region | null
```

A single region, or `null`.

### `.representation(id)`

```ts
representation(id: StructureId): Representation | null
```

The visual coverage claim for a structure, or `null`. Every structure in a valid
base pack has a representation.

```ts
const mode = catalog.representation("somakine:structure:femur")?.mode;
if (mode === "direct") { /* safe to load/inspect instances */ }
```

### `.instancesFor(id)`

```ts
instancesFor(id: StructureId): readonly MeshInstance[]
```

The mesh instances that realize a structure (drawn from its representation).
Empty for `context`/`unavailable` structures.

```ts
for (const instance of catalog.instancesFor("somakine:structure:femur")) {
  console.log(instance.id, instance.laterality, instance.assetId);
}
```

### `.asset(id)`

```ts
asset(id: string): Asset | null
```

An asset (primitive or glTF) by ID, or `null`. Accepts a plain `string` because
asset IDs may carry namespaced colon segments.

### `.relations(id)`

```ts
relations(id: StructureId): readonly Relation[]
```

All relations where the structure is the source or target, sorted by `id`.

```ts
const connected = catalog.relations("somakine:structure:femur");
```

### `.label(id, locale)`

```ts
label(id: string, locale: string): string
```

A localized label for a region or structure. Falls back from `locale` to `"en"`
and finally to the raw `id`, so it never throws and never returns empty.

```ts
catalog.label("somakine:structure:femur", "zh-CN");        // "股骨"
catalog.label("somakine:structure:femur", "en");           // "Femur"
catalog.label("somakine:structure:unknown", "en");         // "somakine:structure:unknown"
```

### `.aliases(id, locale)`

```ts
aliases(id: string, locale: string): readonly string[]
```

Localized aliases for a region or structure (for example `["ACL"]`). Returns an
empty array when there are none; falls back to the requested locale only (no
cross-locale alias fallback).

### `.search(query, locale, limit)`

```ts
search(query: string, locale: string, limit?: number): readonly SearchResult[]
```

Case-insensitive, locale-aware free-text search across each structure's label,
aliases, and `externalIds` values. `limit` defaults to `20` and is capped at
`50`. Returns matching structures with their label, type, and coverage mode.

```ts
interface SearchResult {
  id: StructureId;
  label: string;
  type: StructureType;
  coverage: CoverageMode;
}
```

```ts
const hits = catalog.search("ACL", "en", 5);
// [{ id: "somakine:structure:anterior-cruciate-ligament", label: "Anterior cruciate ligament", ... }]
```

### `.coverage()`

```ts
coverage(): CoverageSummary
```

Counts representations by mode across the whole pack.

```ts
catalog.coverage(); // { direct: 5, compound: 1, context: 2, unavailable: 1 }
```

### `.contextFor(id)`

```ts
contextFor(id: StructureId): readonly Structure[]
```

For a `context`-mode structure, the related structures declared as its visual
context. Empty for any other coverage mode.

```ts
const context = catalog.contextFor("somakine:structure:patellar-tendon");
```

## Validation

Validation is split into a soft function (collects issues) and a hard assertion
(throws). The catalog, viewer, and CLI all use the same validator, so a pack
that validates once is accepted everywhere.

```ts
import {
  validateDataPack, assertDataPack, isSafeAssetUri, cloneDataPack, assetHasRuntimeFile,
} from "@somakine/core";
import type { ValidationResult } from "@somakine/core";
```

### `validateDataPack(value)`

```ts
interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

function validateDataPack(value: unknown): ValidationResult
```

Returns `{ valid: boolean; issues: ValidationIssue[] }`. Never throws — even for
non-object input. Collects every issue rather than stopping at the first.

```ts
const result = validateDataPack(unknownValue);
if (!result.valid) {
  for (const issue of result.issues) console.warn(`${issue.code}: ${issue.message}`);
}
```

`ValidationIssue` is `{ code: ValidationCode; path: string; message: string }`,
where `path` is a JSON Pointer-style path like `$.structures[3].laterality`.

### `assertDataPack(value)`

```ts
function assertDataPack(value: unknown): asserts value is DataPack
```

Runs `validateDataPack` and throws `DataPackValidationError` on failure. Because
it is an assertion, TypeScript narrows the value to `DataPack` afterwards.

```ts
assertDataPack(value); // value: DataPack from here on
```

### `isSafeAssetUri(uri)`

```ts
function isSafeAssetUri(uri: string): boolean
```

`true` only for relative paths that stay inside the data-pack root: no leading
slash, no drive letters, no protocol, no backslashes, no NUL bytes, no empty or
`..`-style traversal segments, and no query strings. Use it in tooling that
checks user-supplied asset paths.

```ts
isSafeAssetUri("assets/body.glb");        // true
isSafeAssetUri("../body.glb");            // false
isSafeAssetUri("https://x/body.glb");     // false
isSafeAssetUri("assets\\body.glb");       // false
```

### `cloneDataPack(pack)`

```ts
function cloneDataPack(pack: DataPack): DataPack
```

A deep clone via `structuredClone`. Useful when you want to mutate a copy before
re-validation without touching the source.

### `assetHasRuntimeFile(asset)`

```ts
function assetHasRuntimeFile(asset: Asset): asset is Extract<Asset, { kind: "gltf" }>
```

Type guard that narrows to `GltfAsset` (the only kind with a runtime file to
fetch and verify). Primitive assets have no file.

```ts
for (const asset of pack.assets) {
  if (assetHasRuntimeFile(asset)) console.log(asset.uri, asset.bytes);
}
```

## Composition

Compose one or more independently licensed `DataExtension`s onto a validated
base pack, producing an ordinary `DataPack` plus a report of what changed.

```ts
import {
  validateDataExtension, assertDataExtension, composeDataPacks,
} from "@somakine/core";
import type { ComposeDataPackOptions, CompositionConflictPolicy } from "@somakine/core";
```

### `validateDataExtension(value, base?)`

```ts
function validateDataExtension(value: unknown, base?: DataPack): ValidationResult
```

Validates an extension against its target pack. When `base` is provided, it also
checks that `targetPack.id` (and `version`, if declared) match the base, and
that locale labels and mappings reference real base-pack IDs. Without `base`,
those target/mapping matches cannot be checked; extension-owned records are
still validated, while references that require base-only structure IDs cannot be
resolved. Always validate again with the base before composing an extension that
fills an existing structure.

```ts
const result = validateDataExtension(extension, basePack);
if (!result.valid) console.warn(result.issues);
```

### `assertDataExtension(value, base?)`

```ts
function assertDataExtension(value: unknown, base?: DataPack): asserts value is DataExtension
```

Throws `DataExtensionValidationError` on failure; narrows to `DataExtension`.

### `composeDataPacks(base, extensions, options?)`

```ts
interface ComposeDataPackOptions {
  conflictPolicy?: CompositionConflictPolicy; // default "fill-unavailable"
}

function composeDataPacks(
  base: DataPack,
  extensions: readonly DataExtension[],
  options?: ComposeDataPackOptions,
): ComposedDataPack
```

Validates `base` and each extension (against the accumulating dataset), then
merges regions, structures, assets, instances, relations, representations, and
locales into a clone of the base. Returns the composed `DataPack` and a
`CompositionReport`. Throws `DataExtensionValidationError` on any ID collision,
URI collision, mapping error, or unresolved coverage conflict.

```ts
const { dataset, report } = composeDataPacks(basePack, [kneeExtension], {
  conflictPolicy: "fill-unavailable",
});
console.log(report.addedStructureIds, report.replacedRepresentationIds);
```

**Conflict policies** govern when an extension may replace an existing
representation for an already-covered structure:

- `fill-unavailable` (default) — a direct/compound extension may replace
  `unavailable` or `context` coverage. Direct-to-direct and direct-to-compound
  conflicts throw. Existing reviewed direct geometry is never silently replaced.
- `prefer-extension` — a direct/compound extension may explicitly replace
  existing coverage (including another direct/compound one).
- `error-on-conflict` — any extension representation for an already-covered
  structure throws.

An extension representation that targets an existing base-pack structure
**requires** a `mappings` entry. Duplicate relations (same type, source, and
target) are deduplicated: their source IDs are unioned and the stronger review
state wins (recorded in `deduplicatedRelationIds`). Every source and license
record is preserved. See [developer data extensions](../DATA_EXTENSIONS.md).

## Errors

```ts
import {
  DataPackValidationError, DataExtensionValidationError,
} from "@somakine/core";
import type { ValidationCode, ValidationIssue } from "@somakine/core";
```

### `ValidationCode`

```ts
type ValidationCode =
  | "invalid_type"        | "invalid_value"       | "invalid_id"
  | "duplicate_id"        | "broken_reference"    | "unsafe_asset_uri"
  | "missing_provenance"  | "invalid_coverage"    | "invalid_laterality"
  | "invalid_extension"   | "extension_conflict"  | "unsupported_schema";
```

### `ValidationIssue`

```ts
interface ValidationIssue {
  code: ValidationCode;
  path: string;     // e.g. "$.structures[3].laterality"
  message: string;
}
```

### `DataPackValidationError`

```ts
class DataPackValidationError extends Error {
  readonly issues: readonly ValidationIssue[];
}
```

Thrown by `assertDataPack` and by `new SomakineCatalog(pack)` when a pack fails
validation.

### `DataExtensionValidationError`

```ts
class DataExtensionValidationError extends Error {
  readonly issues: readonly ValidationIssue[];
}
```

Thrown by `assertDataExtension`, by `composeDataPacks` for composition failures
(such as conflicts and collisions, reported with code `extension_conflict`), and
by the `soma compose` CLI when composition fails.
