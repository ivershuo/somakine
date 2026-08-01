export const SOMAKINE_SCHEMA_VERSION = "0.1.0" as const;
export const SOMAKINE_MAX_ASSET_BYTES = 128 * 1024 * 1024;

export type SomakineId = `somakine:${string}`;
export type StructureId = `somakine:structure:${string}`;
export type RegionId = `somakine:region:${string}`;
export type RelationId = `somakine:relation:${string}`;
export type RepresentationId = `somakine:representation:${string}`;
export type MeshInstanceId = `somakine:instance:${string}`;
export type AssetId = `somakine:asset:${string}`;

export type StructureType = "bone" | "joint" | "ligament" | "muscle" | "tendon" | "skin";
export type Laterality = "none" | "paired" | "midline" | "variable";
export type RelationType =
  | "part_of"
  | "articulates_with"
  | "attaches_to"
  | "originates_from"
  | "inserts_into"
  | "crosses"
  | "contains";
export type CoverageMode = "direct" | "compound" | "context" | "unavailable";
export type ReviewState = "unreviewed" | "source-reviewed" | "expert-reviewed";

export interface SourceRecord {
  id: string;
  title: string;
  version: string;
  url: string;
  retrievedAt: string;
}

export interface LicenseRecord {
  id: string;
  name: string;
  url: string;
  attribution: string;
  redistribution: "permissive" | "attribution" | "share-alike" | "restricted";
}

export interface Region {
  id: RegionId;
  order: number;
  sourceIds: string[];
}

export interface Structure {
  id: StructureId;
  type: StructureType;
  laterality: Laterality;
  regionIds: RegionId[];
  externalIds: Record<string, string>;
  sourceIds: string[];
  reviewState: ReviewState;
}

export interface Relation {
  id: RelationId;
  type: RelationType;
  sourceId: StructureId;
  targetId: StructureId;
  sourceIds: string[];
  reviewState: ReviewState;
}

export interface Transform {
  position?: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  scale?: readonly [number, number, number];
}

export interface PrimitiveDefinition {
  shape: "box" | "sphere" | "cylinder" | "capsule";
  dimensions: readonly [number, number, number];
  color: string;
}

export interface GeometryBudget {
  vertices: number;
  gpuBytes: number;
}

export interface PrimitiveAsset {
  id: AssetId;
  kind: "primitive";
  primitive: PrimitiveDefinition;
  sourceIds: string[];
  licenseId: string;
}

export interface GltfAsset {
  id: AssetId;
  kind: "gltf";
  uri: string;
  mediaType: "model/gltf-binary" | "model/gltf+json";
  sha256: string;
  bytes: number;
  geometry: GeometryBudget;
  sourceIds: string[];
  licenseId: string;
}

export type Asset = PrimitiveAsset | GltfAsset;

export interface MeshSelector {
  kind: "scene" | "node-name";
  value?: string;
}

export interface MeshInstance {
  id: MeshInstanceId;
  assetId: AssetId;
  laterality: "none" | "left" | "right" | "bilateral";
  selector: MeshSelector;
  transform?: Transform;
}

export interface Representation {
  id: RepresentationId;
  structureId: StructureId;
  mode: CoverageMode;
  instanceIds: MeshInstanceId[];
  contextStructureIds: StructureId[];
  sourceIds: string[];
  reviewState: ReviewState;
}

export interface LocalePack {
  locale: string;
  labels: Record<string, string>;
  aliases: Record<string, string[]>;
}

export interface DataPack {
  schemaVersion: typeof SOMAKINE_SCHEMA_VERSION;
  id: string;
  version: string;
  title: string;
  description: string;
  createdAt: string;
  sources: SourceRecord[];
  licenses: LicenseRecord[];
  regions: Region[];
  structures: Structure[];
  relations: Relation[];
  assets: Asset[];
  meshInstances: MeshInstance[];
  representations: Representation[];
  locales: LocalePack[];
}

export interface CoverageSummary {
  direct: number;
  compound: number;
  context: number;
  unavailable: number;
}
