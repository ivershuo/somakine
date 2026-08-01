import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runCommand } from "@somakine/cli";
import { musculoskeletalBasic } from "@somakine/musculoskeletal-basic";

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
