import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import * as THREE from "three";
import { assertSelfContainedGlb, applySideVisibility, calculateViewFit, combineStructureSides, createPrimitiveObject, disposeObject3D, findGltfNode, matchesSide, normalizeViewVector, pickStructureHit, structureHighlightObjects, verifyAssetBytes } from "@somakine/viewer";

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

test("matchesSide treats bilateral instances as part of either side", () => {
  assert.equal(matchesSide("left", "left"), true);
  assert.equal(matchesSide("left", "right"), false);
  assert.equal(matchesSide("right", "right"), true);
  assert.equal(matchesSide("bilateral", "left"), true);
  assert.equal(matchesSide("bilateral", "right"), true);
  assert.equal(matchesSide("none", "left"), false);
  assert.equal(matchesSide(undefined, "left"), false);
});

test("structureHighlightObjects narrows to the requested side of a paired structure", () => {
  const id = "somakine:structure:humerus";
  const group = pairedGroup(id, ["left", "right"]);
  const groups = new Map([[id, group]]);
  const representation = { mode: "direct" };
  // No side → the whole structure group.
  assert.deepEqual(structureHighlightObjects(groups, id, representation, undefined), [group]);
  // Side narrows to that side's instance child only.
  assert.deepEqual(structureHighlightObjects(groups, id, representation, "left"), [group.children[0]]);
  assert.deepEqual(structureHighlightObjects(groups, id, representation, "right"), [group.children[1]]);
});

test("structureHighlightObjects includes bilateral instances for either side", () => {
  const id = "somakine:structure:skull";
  const group = pairedGroup(id, ["bilateral"]);
  const groups = new Map([[id, group]]);
  const representation = { mode: "direct" };
  assert.deepEqual(structureHighlightObjects(groups, id, representation, "left"), [group.children[0]]);
  assert.deepEqual(structureHighlightObjects(groups, id, representation, "right"), [group.children[0]]);
});

test("structureHighlightObjects falls back to the whole structure when the requested side is absent", () => {
  const id = "somakine:structure:second-metatarsal";
  const group = pairedGroup(id, ["none"]); // a non-lateralized bone
  const groups = new Map([[id, group]]);
  const representation = { mode: "direct" };
  // Asking for "left" on a none-only structure addresses the whole structure.
  assert.deepEqual(structureHighlightObjects(groups, id, representation, "left"), [group]);
});

test("structureHighlightObjects filters context structures by side", () => {
  const femurId = "somakine:structure:femur";
  const femur = pairedGroup(femurId, ["left", "right"]);
  const groups = new Map([[femurId, femur]]);
  const representation = { mode: "context", contextStructureIds: [femurId] };
  assert.deepEqual(
    structureHighlightObjects(groups, "somakine:structure:knee-joint", representation, "left"),
    [femur.children[0]],
  );
});

test("applySideVisibility isolates a side but leaves a non-lateral group whole", () => {
  const left = new THREE.Object3D();
  left.userData.somakineSide = "left";
  const right = new THREE.Object3D();
  right.userData.somakineSide = "right";
  const paired = new THREE.Group();
  paired.add(left, right);
  applySideVisibility(paired, "left");
  assert.equal(left.visible, true);
  assert.equal(right.visible, false);

  // A non-lateral group has no matching-side instance: nothing is hidden.
  const none = new THREE.Object3D();
  none.userData.somakineSide = "none";
  const midline = new THREE.Group();
  midline.add(none);
  applySideVisibility(midline, "left");
  assert.equal(none.visible, true);
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

function pairedGroup(id, sides) {
  const group = new THREE.Group();
  group.name = id;
  group.userData.structureId = id;
  for (const side of sides) {
    const instance = new THREE.Object3D();
    instance.userData.somakineSide = side;
    group.add(instance);
  }
  return group;
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
