import assert from "node:assert/strict";
import test from "node:test";
import {
  BODY_PARTS_3D_LICENSE_ID,
  BODY_PARTS_3D_SOURCE_ID,
  bodyParts3DAsset,
  createBodyParts3DPack,
} from "@somakine/bodyparts3d";
import { musculoskeletalBasic } from "@somakine/musculoskeletal-basic";

test("BodyParts3D asset helper makes provenance mandatory", () => {
  const asset = bodyParts3DAsset({
    id: "somakine:asset:bodyparts3d:femur",
    uri: "assets/femur.glb",
    mediaType: "model/gltf-binary",
    sha256: "a".repeat(64),
    bytes: 128,
    vertices: 24,
    gpuBytes: 768,
  });
  assert.equal(asset.licenseId, BODY_PARTS_3D_LICENSE_ID);
  assert.deepEqual(asset.sourceIds, [BODY_PARTS_3D_SOURCE_ID]);
});

test("BodyParts3D pack factory rejects assets with missing attribution", () => {
  const fixture = structuredClone(musculoskeletalBasic);
  assert.throws(() => createBodyParts3DPack({
    id: "bad-pack",
    version: "0.0.0",
    title: "Bad",
    description: "Missing provenance",
    createdAt: fixture.createdAt,
    regions: fixture.regions,
    structures: fixture.structures,
    relations: fixture.relations,
    assets: [{
      id: "somakine:asset:bad",
      kind: "gltf",
      uri: "assets/bad.glb",
      mediaType: "model/gltf-binary",
      sha256: "0".repeat(64),
      bytes: 1,
      geometry: { vertices: 1, gpuBytes: 1 },
      sourceIds: ["wrong"],
      licenseId: "wrong",
    }],
    meshInstances: [],
    representations: fixture.representations,
    locales: fixture.locales,
  }), /missing required source or license provenance/);
});
