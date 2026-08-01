import {
  SOMAKINE_SCHEMA_VERSION,
  assertDataPack,
  type DataPack,
  type GltfAsset,
  type LicenseRecord,
  type LocalePack,
  type MeshInstance,
  type Region,
  type Relation,
  type Representation,
  type SourceRecord,
  type Structure,
} from "@somakine/core";

export const BODY_PARTS_3D_SOURCE_ID = "bodyparts3d-4";
export const BODY_PARTS_3D_LICENSE_ID = "CC-BY-4.0";
export const BODY_PARTS_3D_ATTRIBUTION =
  "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International";

export const BODY_PARTS_3D_SOURCE: SourceRecord = {
  id: BODY_PARTS_3D_SOURCE_ID,
  title: "BodyParts3D",
  version: "4.0",
  url: "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html",
  retrievedAt: "2026-08-01T00:00:00Z",
};

export const BODY_PARTS_3D_LICENSE: LicenseRecord = {
  id: BODY_PARTS_3D_LICENSE_ID,
  name: "Creative Commons Attribution 4.0 International",
  url: "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html",
  attribution: BODY_PARTS_3D_ATTRIBUTION,
  redistribution: "attribution",
};

export interface BodyParts3DPackInput {
  id: string;
  version: string;
  title: string;
  description: string;
  createdAt: string;
  additionalSources?: SourceRecord[];
  additionalLicenses?: LicenseRecord[];
  regions: Region[];
  structures: Structure[];
  relations: Relation[];
  assets: GltfAsset[];
  meshInstances: MeshInstance[];
  representations: Representation[];
  locales: LocalePack[];
}

export function createBodyParts3DPack(input: BodyParts3DPackInput): DataPack {
  for (const asset of input.assets) {
    if (asset.licenseId !== BODY_PARTS_3D_LICENSE_ID || !asset.sourceIds.includes(BODY_PARTS_3D_SOURCE_ID)) {
      throw new Error(`BodyParts3D asset ${asset.id} is missing required source or license provenance`);
    }
  }
  const pack: DataPack = {
    schemaVersion: SOMAKINE_SCHEMA_VERSION,
    id: input.id,
    version: input.version,
    title: input.title,
    description: input.description,
    createdAt: input.createdAt,
    sources: [BODY_PARTS_3D_SOURCE, ...(input.additionalSources ?? [])],
    licenses: [BODY_PARTS_3D_LICENSE, ...(input.additionalLicenses ?? [])],
    regions: input.regions,
    structures: input.structures,
    relations: input.relations,
    assets: input.assets,
    meshInstances: input.meshInstances,
    representations: input.representations,
    locales: input.locales,
  };
  assertDataPack(pack);
  return structuredClone(pack);
}

export interface BodyParts3DAssetInput {
  id: GltfAsset["id"];
  uri: string;
  mediaType: GltfAsset["mediaType"];
  sha256: string;
  bytes: number;
  vertices: number;
  gpuBytes: number;
  additionalSourceIds?: string[];
}

export function bodyParts3DAsset(input: BodyParts3DAssetInput): GltfAsset {
  return {
    id: input.id,
    kind: "gltf",
    uri: input.uri,
    mediaType: input.mediaType,
    sha256: input.sha256,
    bytes: input.bytes,
    geometry: { vertices: input.vertices, gpuBytes: input.gpuBytes },
    sourceIds: [BODY_PARTS_3D_SOURCE_ID, ...(input.additionalSourceIds ?? [])],
    licenseId: BODY_PARTS_3D_LICENSE_ID,
  };
}
