import { createHash } from "node:crypto";
import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  SomakineCatalog,
  assetHasRuntimeFile,
  assertDataPack,
  composeDataPacks,
  DataExtensionValidationError,
  isSafeAssetUri,
  validateDataPack,
  validateDataExtension,
  type CompositionConflictPolicy,
  type ComposedDataPack,
  type DataExtension,
  type DataPack,
} from "@somakine/core";

export type SomaCommand = "validate" | "inspect" | "coverage" | "verify-assets" | "validate-extension" | "compose";

export interface RunCommandOptions {
  baseFile?: string;
  extensionFiles?: readonly string[];
  outputFile?: string;
  conflictPolicy?: CompositionConflictPolicy;
}

export interface CommandResult {
  ok: boolean;
  command: SomaCommand;
  data?: unknown;
  errors?: unknown;
}

export async function runCommand(command: SomaCommand, file: string, options: RunCommandOptions = {}): Promise<CommandResult> {
  const absolute = path.resolve(file);
  const value = await readJson(absolute, command);
  if (!value.ok) return value.result;
  if (command === "validate-extension") return validateExtension(value.value, options.baseFile, command);
  if (command === "compose") return composeCommand(value.value, absolute, options, command);
  const validation = validateDataPack(value.value);
  if (!validation.valid) return { ok: false, command, errors: validation.issues };
  assertDataPack(value.value);
  if (command === "validate") return { ok: true, command, data: { id: value.value.id, version: value.value.version } };
  const catalog = new SomakineCatalog(value.value);
  if (command === "coverage") return { ok: true, command, data: catalog.coverage() };
  if (command === "inspect") {
    return {
      ok: true,
      command,
      data: {
        id: value.value.id,
        version: value.value.version,
        schemaVersion: value.value.schemaVersion,
        regions: value.value.regions.length,
        structures: value.value.structures.length,
        relations: value.value.relations.length,
        assets: value.value.assets.length,
        meshInstances: value.value.meshInstances.length,
        coverage: catalog.coverage(),
        locales: value.value.locales.map((locale) => locale.locale).sort(),
      },
    };
  }
  return verifyAssets(value.value, path.dirname(absolute));
}

async function validateExtension(value: unknown, baseFile: string | undefined, command: SomaCommand): Promise<CommandResult> {
  let base: DataPack | undefined;
  if (baseFile) {
    const baseResult = await readJson(path.resolve(baseFile), command);
    if (!baseResult.ok) return baseResult.result;
    const baseValidation = validateDataPack(baseResult.value);
    if (!baseValidation.valid) return { ok: false, command, errors: baseValidation.issues };
    assertDataPack(baseResult.value);
    base = baseResult.value;
  }
  const validation = validateDataExtension(value, base);
  if (!validation.valid) return { ok: false, command, errors: validation.issues };
  const extension = value as { id: string; version: string; namespace: string; targetPack: { id: string } };
  return { ok: true, command, data: { id: extension.id, version: extension.version, namespace: extension.namespace, targetPackId: extension.targetPack.id } };
}

async function composeCommand(value: unknown, baseFile: string, options: RunCommandOptions, command: SomaCommand): Promise<CommandResult> {
  const extensionFiles = options.extensionFiles ?? [];
  if (extensionFiles.length === 0) return { ok: false, command, errors: [{ code: "invalid_extension", message: "compose requires at least one extension file" }] };
  const baseValidation = validateDataPack(value);
  if (!baseValidation.valid) return { ok: false, command, errors: baseValidation.issues };
  assertDataPack(value);
  const extensions: DataExtension[] = [];
  for (const file of extensionFiles) {
    const result = await readJson(path.resolve(file), command);
    if (!result.ok) return result.result;
    const validation = validateDataExtension(result.value, value as DataPack);
    if (!validation.valid) return { ok: false, command, errors: validation.issues };
    extensions.push(result.value as DataExtension);
  }
  let composed: ComposedDataPack;
  try {
    composed = composeDataPacks(value as DataPack, extensions, options.conflictPolicy ? { conflictPolicy: options.conflictPolicy } : {});
  } catch (error) {
    if (error instanceof DataExtensionValidationError) return { ok: false, command, errors: error.issues };
    return { ok: false, command, errors: [{ code: "extension_conflict", message: errorMessage(error) }] };
  }
  if (options.outputFile) await writeFile(path.resolve(options.outputFile), `${JSON.stringify(composed.dataset, null, 2)}\n`, "utf8");
  return {
    ok: true,
    command,
    data: {
      outputFile: options.outputFile ? path.resolve(options.outputFile) : undefined,
      ...composed.report,
      baseFile,
    },
  };
}

async function readJson(file: string, command: SomaCommand): Promise<{ ok: true; value: unknown } | { ok: false; result: CommandResult }> {
  try {
    return { ok: true, value: JSON.parse(await readFile(file, "utf8")) };
  } catch (error) {
    return { ok: false, result: { ok: false, command, errors: [{ code: "read_failed", message: errorMessage(error) }] } };
  }
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
