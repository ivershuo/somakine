import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { assertSelfContainedGlb, createPrimitiveObject, disposeObject3D, verifyAssetBytes } from "@somakine/viewer";

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
