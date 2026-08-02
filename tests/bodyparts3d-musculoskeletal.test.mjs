import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { bodyParts3DMusculoskeletal, bodyParts3DMusculoskeletalStats } from "@somakine/bodyparts3d-musculoskeletal";
import { SomakineCatalog, validateDataPack } from "@somakine/core";
import { runCommand } from "@somakine/cli";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("real BodyParts3D pack has canonical bilingual whole-body coverage", () => {
  assert.deepEqual(validateDataPack(bodyParts3DMusculoskeletal), { valid: true, issues: [] });
  assert.deepEqual(bodyParts3DMusculoskeletalStats, {
    regions: 8,
    structures: 187,
    assets: 15,
    coverage: { direct: 158, compound: 4, context: 0, unavailable: 25 },
  });
  const catalog = new SomakineCatalog(bodyParts3DMusculoskeletal);
  const humerus = catalog.structure("somakine:structure:humerus");
  assert.deepEqual(humerus.regionIds, ["somakine:region:elbow-forearm", "somakine:region:shoulder"]);
  assert.equal(humerus.externalIds.fma, "FMA13303");
  assert.equal(catalog.label(humerus.id, "zh-CN"), "肱骨");
  assert.equal(catalog.representation("somakine:structure:anterior-cruciate-ligament").mode, "unavailable");
  assert.deepEqual(catalog.contextFor("somakine:structure:anterior-cruciate-ligament"), []);
  const calcanealTendon = catalog.structure("somakine:structure:calcaneal-tendon");
  assert.equal(calcanealTendon.externalIds.fma, "FMA51061");
  assert.equal(catalog.representation(calcanealTendon.id).mode, "direct");
  assert.equal(catalog.label(calcanealTendon.id, "zh-CN"), "跟腱");
});

test("all copied BodyParts3D runtime assets match their manifest", async () => {
  const manifest = path.join(repositoryRoot, "data-packs/bodyparts3d-musculoskeletal/public/pack.json");
  const result = await runCommand("verify-assets", manifest);
  assert.deepEqual(result, { ok: true, command: "verify-assets", data: { verified: 15 } });
});

test("real pack keeps the BodyParts3D attribution boundary explicit", () => {
  assert.equal(bodyParts3DMusculoskeletal.licenses[0].id, "CC-BY-4.0");
  assert.match(bodyParts3DMusculoskeletal.licenses[0].attribution, /BodyParts3D/);
  assert.ok(bodyParts3DMusculoskeletal.assets.every((asset) =>
    asset.kind === "gltf" && asset.licenseId === "CC-BY-4.0" && asset.sourceIds.includes("bodyparts3d-4")));
});

test("supplemental manifest records the source comparison boundary", async () => {
  const report = JSON.parse(await readFile(path.join(
    repositoryRoot,
    "data-packs/bodyparts3d-musculoskeletal/public/import-report.json",
  ), "utf8"));
  assert.deepEqual(
    {
      candidates: report.sourceAudit.candidateRows,
      selected: report.sourceAudit.selectedRows,
      excluded: report.sourceAudit.excludedRows.length,
    },
    { candidates: 72, selected: 37, excluded: 35 },
  );
});
