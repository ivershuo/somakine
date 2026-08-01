import assert from "node:assert/strict";
import test from "node:test";
import { SOMAKINE_MAX_ASSET_BYTES, SomakineCatalog, isSafeAssetUri, validateDataPack } from "@somakine/core";
import { musculoskeletalBasic } from "@somakine/musculoskeletal-basic";

test("synthetic pack satisfies the executable contract", () => {
  assert.deepEqual(validateDataPack(musculoskeletalBasic), { valid: true, issues: [] });
  const catalog = new SomakineCatalog(musculoskeletalBasic);
  assert.deepEqual(catalog.coverage(), { direct: 5, compound: 1, context: 2, unavailable: 1 });
  assert.equal(catalog.search("ACL", "en")[0]?.id, "somakine:structure:anterior-cruciate-ligament");
  assert.equal(catalog.label("somakine:structure:femur", "zh-CN"), "股骨");
});

test("catalog isolates callers from the input object", () => {
  const input = structuredClone(musculoskeletalBasic);
  const catalog = new SomakineCatalog(input);
  input.title = "changed outside";
  assert.equal(catalog.pack.title, musculoskeletalBasic.title);
  assert.throws(() => { catalog.pack.title = "changed inside"; }, TypeError);
});

test("validation rejects dishonest coverage and traversal asset paths", () => {
  const dishonest = structuredClone(musculoskeletalBasic);
  dishonest.representations.find(({ mode }) => mode === "unavailable").instanceIds.push("somakine:instance:femur-left");
  const result = validateDataPack(dishonest);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(({ code }) => code === "invalid_coverage"));

  for (const path of ["../body.glb", "/body.glb", "https://example.com/body.glb", "assets\\body.glb", "assets//body.glb", "assets/%2e%2e/body.glb", "assets/body.glb?x=1"]) {
    assert.equal(isSafeAssetUri(path), false, path);
  }
  assert.equal(isSafeAssetUri("assets/body.glb"), true);
});

test("validation caps each runtime asset before allocation", () => {
  const pack = structuredClone(musculoskeletalBasic);
  const original = pack.assets[0];
  pack.assets[0] = {
    id: original.id,
    kind: "gltf",
    uri: "assets/body.glb",
    mediaType: "model/gltf-binary",
    sha256: "0".repeat(64),
    bytes: SOMAKINE_MAX_ASSET_BYTES + 1,
    geometry: { vertices: 1, gpuBytes: 1 },
    sourceIds: original.sourceIds,
    licenseId: original.licenseId,
  };
  const result = validateDataPack(pack);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(({ path, message }) => path.endsWith(".bytes") && message.includes("runtime limit")));
});
