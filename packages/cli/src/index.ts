import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
  SomakineCatalog,
  assetHasRuntimeFile,
  assertDataPack,
  isSafeAssetUri,
  validateDataPack,
  type DataPack,
} from "@somakine/core";

export type SomaCommand = "validate" | "inspect" | "coverage" | "verify-assets";

export interface CommandResult {
  ok: boolean;
  command: SomaCommand;
  data?: unknown;
  errors?: unknown;
}

export async function runCommand(command: SomaCommand, file: string): Promise<CommandResult> {
  const absolute = path.resolve(file);
  let value: unknown;
  try {
    value = JSON.parse(await readFile(absolute, "utf8"));
  } catch (error) {
    return { ok: false, command, errors: [{ code: "read_failed", message: errorMessage(error) }] };
  }
  const validation = validateDataPack(value);
  if (!validation.valid) return { ok: false, command, errors: validation.issues };
  assertDataPack(value);
  if (command === "validate") return { ok: true, command, data: { id: value.id, version: value.version } };
  const catalog = new SomakineCatalog(value);
  if (command === "coverage") return { ok: true, command, data: catalog.coverage() };
  if (command === "inspect") {
    return {
      ok: true,
      command,
      data: {
        id: value.id,
        version: value.version,
        schemaVersion: value.schemaVersion,
        regions: value.regions.length,
        structures: value.structures.length,
        relations: value.relations.length,
        assets: value.assets.length,
        meshInstances: value.meshInstances.length,
        coverage: catalog.coverage(),
        locales: value.locales.map((locale) => locale.locale).sort(),
      },
    };
  }
  return verifyAssets(value, path.dirname(absolute));
}

async function verifyAssets(pack: DataPack, root: string): Promise<CommandResult> {
  const errors: Array<{ assetId: string; code: string; message: string }> = [];
  const rootReal = await realpath(root);
  for (const asset of pack.assets) {
    if (!assetHasRuntimeFile(asset)) continue;
    if (!isSafeAssetUri(asset.uri)) {
      errors.push({ assetId: asset.id, code: "unsafe_asset_uri", message: asset.uri });
      continue;
    }
    try {
      const candidate = path.resolve(root, asset.uri);
      const candidateReal = await realpath(candidate);
      if (candidateReal !== rootReal && !candidateReal.startsWith(`${rootReal}${path.sep}`)) {
        throw new Error("asset resolves outside data-pack root");
      }
      const info = await stat(candidateReal);
      if (!info.isFile()) throw new Error("asset is not a regular file");
      if (info.size !== asset.bytes) throw new Error(`byte mismatch: expected ${asset.bytes}, received ${info.size}`);
      const bytes = await readFile(candidateReal);
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (digest !== asset.sha256) throw new Error(`sha256 mismatch: expected ${asset.sha256}, received ${digest}`);
    } catch (error) {
      errors.push({ assetId: asset.id, code: "asset_verification_failed", message: errorMessage(error) });
    }
  }
  return errors.length > 0
    ? { ok: false, command: "verify-assets", errors }
    : { ok: true, command: "verify-assets", data: { verified: pack.assets.filter(assetHasRuntimeFile).length } };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
