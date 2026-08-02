import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runCommand } from "@somakine/cli";
import { musculoskeletalBasic } from "@somakine/musculoskeletal-basic";
import { demoExtension } from "./extension-fixture.mjs";

test("CLI validates and reports coverage", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "somakine-cli-"));
  const file = path.join(directory, "pack.json");
  await writeFile(file, JSON.stringify(musculoskeletalBasic));
  const validation = await runCommand("validate", file);
  const coverage = await runCommand("coverage", file);
  const assets = await runCommand("verify-assets", file);
  assert.equal(validation.ok, true);
  assert.deepEqual(coverage.data, { direct: 5, compound: 1, context: 2, unavailable: 1 });
  assert.deepEqual(assets.data, { verified: 0 });
});

test("CLI returns structured errors for malformed JSON", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "somakine-cli-bad-"));
  const file = path.join(directory, "pack.json");
  await writeFile(file, "{");
  const result = await runCommand("validate", file);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, "read_failed");
});

test("CLI validates and composes developer data extensions", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "somakine-cli-extension-"));
  const baseFile = path.join(directory, "base.json");
  const extensionFile = path.join(directory, "extension.json");
  const outputFile = path.join(directory, "composed.json");
  await writeFile(baseFile, JSON.stringify(musculoskeletalBasic));
  await writeFile(extensionFile, JSON.stringify(demoExtension));
  const validation = await runCommand("validate-extension", extensionFile, { baseFile });
  assert.equal(validation.ok, true);
  assert.equal(validation.data.targetPackId, musculoskeletalBasic.id);
  const composed = await runCommand("compose", baseFile, { extensionFiles: [extensionFile], outputFile });
  assert.equal(composed.ok, true);
  assert.equal(composed.data.outputFile, outputFile);
  const merged = JSON.parse(await readFile(outputFile, "utf8"));
  assert.equal(merged.structures.some(({ id }) => id === "somakine:structure:demo-knee-ligament"), true);
});
