import assert from "node:assert/strict";
import test from "node:test";
import {
  SOMAKINE_MAX_ASSET_BYTES,
  SomakineCatalog,
  composeDataPacks,
  isSafeAssetUri,
  validateDataExtension,
  validateDataPack,
} from "@somakine/core";
import { musculoskeletalBasic } from "@somakine/musculoskeletal-basic";
import { demoExtension } from "./extension-fixture.mjs";

test("synthetic pack satisfies the executable contract", () => {
  assert.deepEqual(validateDataPack(musculoskeletalBasic), { valid: true, issues: [] });
  assert.equal(musculoskeletalBasic.licenses[0].id, "MIT");
  assert.equal(musculoskeletalBasic.licenses[0].url, "https://opensource.org/license/mit");
  const catalog = new SomakineCatalog(musculoskeletalBasic);
  assert.deepEqual(catalog.coverage(), { direct: 5, compound: 1, context: 2, unavailable: 1 });
  assert.equal(catalog.search("ACL", "en")[0]?.id, "somakine:structure:anterior-cruciate-ligament");
  assert.equal(catalog.label("somakine:structure:femur", "zh-CN"), "股骨");
});

test("instancesFor filters by side and returns nothing for a non-lateral structure", () => {
  const catalog = new SomakineCatalog(musculoskeletalBasic);
  const humerus = "somakine:structure:humerus";
  assert.equal(catalog.instancesFor(humerus).length, 2);
  assert.equal(catalog.instancesFor(humerus, { side: "left" })[0].id, "somakine:instance:humerus-left");
  assert.equal(catalog.instancesFor(humerus, { side: "right" })[0].id, "somakine:instance:humerus-right");
  // a "none" structure has no side-specific instances, so a side filter is empty
  assert.equal(catalog.instancesFor("somakine:structure:skull", { side: "left" }).length, 0);
  assert.equal(catalog.instancesFor("somakine:structure:skull").length, 1);
});

test("data extensions validate, fill missing coverage, and add namespaced structures", () => {
  assert.deepEqual(validateDataExtension(demoExtension, musculoskeletalBasic), { valid: true, issues: [] });
  const composed = composeDataPacks(musculoskeletalBasic, [demoExtension]);
  assert.deepEqual(composed.dataset && new SomakineCatalog(composed.dataset).coverage(), {
    direct: 5,
    compound: 3,
    context: 2,
    unavailable: 0,
  });
  assert.equal(composed.dataset.structures.length, musculoskeletalBasic.structures.length + 1);
  assert.equal(composed.dataset.regions.length, musculoskeletalBasic.regions.length + 1);
  assert.equal(new SomakineCatalog(composed.dataset).label("somakine:structure:demo-knee-ligament", "zh-CN"), "演示膝韧带");
  assert.deepEqual(composed.report.replacedRepresentationIds, ["somakine:representation:demo-knee-acl"]);
  assert.deepEqual(composed.report.addedStructureIds, ["somakine:structure:demo-knee-ligament"]);
});

test("composition rejects direct geometry conflicts unless explicitly overridden", () => {
  const conflicting = structuredClone(demoExtension);
  conflicting.representations[0].structureId = "somakine:structure:femur";
  conflicting.mappings = [{
    targetStructureId: "somakine:structure:femur",
    match: "exact",
    confidence: 1,
    sourceIds: ["demo-knee-source"],
    reviewState: "source-reviewed",
  }];
  assert.throws(
    () => composeDataPacks(musculoskeletalBasic, [conflicting]),
    /representation conflict for somakine:structure:femur/,
  );
  const preferred = composeDataPacks(musculoskeletalBasic, [conflicting], { conflictPolicy: "prefer-extension" });
  assert.equal(new SomakineCatalog(preferred.dataset).representation("somakine:structure:femur").mode, "compound");
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
