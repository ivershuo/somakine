import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import * as THREE from "three";
import { assertSelfContainedGlb, calculateViewFit, combineStructureSides, createPrimitiveObject, disposeObject3D, findGltfNode, normalizeViewVector, pickStructureHit, verifyAssetBytes } from "@somakine/viewer";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

test("primitive renderer constructs disposable Three.js geometry", () => {
  const object = createPrimitiveObject({
    id: "somakine:asset:test",
    kind: "primitive",
    primitive: { shape: "capsule", dimensions: [1, 2, 1], color: "#ffffff" },
    sourceIds: ["fixture"],
    licenseId: "fixture",
  });
  assert.equal(object.type, "Mesh");
  disposeObject3D(object);
});

test("runtime asset verification checks length and digest", async () => {
  const bytes = new TextEncoder().encode("somakine");
  const digest = await webcrypto.subtle.digest("SHA-256", bytes);
  const sha256 = Buffer.from(digest).toString("hex");
  const asset = {
    id: "somakine:asset:test-glb",
    kind: "gltf",
    uri: "assets/test.glb",
    mediaType: "model/gltf-binary",
    sha256,
    bytes: bytes.byteLength,
    geometry: { vertices: 1, gpuBytes: 1 },
    sourceIds: ["fixture"],
    licenseId: "fixture",
  };
  await verifyAssetBytes(asset, bytes.buffer);
  await assert.rejects(() => verifyAssetBytes({ ...asset, sha256: "0".repeat(64) }, bytes.buffer), /SHA-256 mismatch/);
});

test("GLB inspection rejects hidden network references", () => {
  assert.doesNotThrow(() => assertSelfContainedGlb(glb({ asset: { version: "2.0" }, scenes: [{}], scene: 0 })));
  assert.throws(
    () => assertSelfContainedGlb(glb({ asset: { version: "2.0" }, images: [{ uri: "https://tracker.example/image.png" }] })),
    /must not contain external or data URIs/,
  );
});

test("node selection accepts original glTF names sanitized by Three.js", () => {
  const root = new THREE.Group();
  const child = new THREE.Group();
  child.name = THREE.PropertyBinding.sanitizeNodeName("head-neck:atlas");
  root.add(child);
  assert.equal(findGltfNode(root, "head-neck:atlas"), child);
});

test("camera fit keeps portrait views inside the limiting field of view", () => {
  const wide = calculateViewFit(1, 38, 2);
  const portrait = calculateViewFit(1, 38, 0.5);
  assert.ok(portrait.distance > wide.distance);
  assert.ok(portrait.minDistance < portrait.distance);
  assert.ok(portrait.distance < portrait.maxDistance);
  assert.ok(portrait.near > 0);
  assert.ok(portrait.far > portrait.distance);
});

test("view vectors normalize and safely fall back from invalid axes", () => {
  assert.deepEqual(normalizeViewVector([0, 0, 2], [0, 1, 0]), [0, 0, 1]);
  assert.deepEqual(normalizeViewVector([0, 0, 0], [0, 1, 0]), [0, 1, 0]);
  assert.deepEqual(normalizeViewVector([Number.NaN, 0, 0], [0, 0, 1]), [0, 0, 1]);
});

test("structure sides collapse to a single selection side", () => {
  assert.equal(combineStructureSides([]), "none");
  assert.equal(combineStructureSides(["none"]), "none");
  assert.equal(combineStructureSides(["left"]), "left");
  assert.equal(combineStructureSides(["right"]), "right");
  assert.equal(combineStructureSides(["left", "right"]), "bilateral");
  assert.equal(combineStructureSides(["bilateral"]), "bilateral");
  assert.equal(combineStructureSides(["none", "left"]), "left");
  assert.equal(combineStructureSides(new Set(["left", "none", "right"])), "bilateral");
});

test("picking skips hits on hidden structures and takes the nearest visible one", () => {
  const bone = pickHit("somakine:structure:femur");
  const muscle = pickHit("somakine:structure:deltoid");
  // The hidden muscle is nearer (listed first) but must be skipped in favour of the bone.
  assert.equal(pickStructureHit([muscle, bone], (id) => id === "somakine:structure:femur").structureId, "somakine:structure:femur");
  // Both visible: the nearest (first) hit wins.
  assert.equal(pickStructureHit([muscle, bone], () => true).structureId, "somakine:structure:deltoid");
  // Everything hidden resolves to nothing.
  assert.equal(pickStructureHit([muscle, bone], () => false), undefined);
  // Hits without a structure id (decorations, controls) are ignored.
  assert.equal(pickStructureHit([pickHit(), bone], () => true).structureId, "somakine:structure:femur");
});

function pickHit(structureId) {
  return { object: { userData: structureId ? { structureId } : {} } };
}

function glb(document) {
  const encoded = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = Math.ceil(encoded.length / 4) * 4;
  const output = new Uint8Array(20 + jsonLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, output.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  output.fill(0x20, 20);
  output.set(encoded, 20);
  return output.buffer;
}
