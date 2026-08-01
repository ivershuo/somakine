import { DataPackValidationError, type ValidationCode, type ValidationIssue } from "./errors.js";
import {
  SOMAKINE_SCHEMA_VERSION,
  SOMAKINE_MAX_ASSET_BYTES,
  type Asset,
  type CoverageMode,
  type DataPack,
  type Laterality,
  type RelationType,
  type ReviewState,
  type StructureType,
} from "./model.js";

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

const ID_PATTERNS = {
  region: /^somakine:region:[a-z0-9]+(?:-[a-z0-9]+)*$/,
  structure: /^somakine:structure:[a-z0-9]+(?:-[a-z0-9]+)*$/,
  relation: /^somakine:relation:[a-z0-9]+(?:-[a-z0-9]+)*$/,
  representation: /^somakine:representation:[a-z0-9]+(?:-[a-z0-9]+)*$/,
  instance: /^somakine:instance:[a-z0-9]+(?:-[a-z0-9]+)*$/,
  asset: /^somakine:asset:[a-z0-9]+(?:[-:][a-z0-9]+)*$/,
} as const;

const STRUCTURE_TYPES = new Set<StructureType>(["bone", "joint", "ligament", "muscle", "tendon", "skin"]);
const LATERALITIES = new Set<Laterality>(["none", "paired", "midline", "variable"]);
const INSTANCE_LATERALITIES = new Set(["none", "left", "right", "bilateral"]);
const RELATION_TYPES = new Set<RelationType>([
  "part_of", "articulates_with", "attaches_to", "originates_from", "inserts_into", "crosses", "contains",
]);
const COVERAGE_MODES = new Set<CoverageMode>(["direct", "compound", "context", "unavailable"]);
const REVIEW_STATES = new Set<ReviewState>(["unreviewed", "source-reviewed", "expert-reviewed"]);
const REDISTRIBUTIONS = new Set(["permissive", "attribution", "share-alike", "restricted"]);
const PRIMITIVE_SHAPES = new Set(["box", "sphere", "cylinder", "capsule"]);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function validateDataPack(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const issue: IssueFn = (code, path, message) => issues.push({ code, path, message });
  if (!isRecord(value)) {
    issue("invalid_type", "$", "data pack must be an object");
    return { valid: false, issues };
  }
  if (value.schemaVersion !== SOMAKINE_SCHEMA_VERSION) issue("unsupported_schema", "$.schemaVersion", `expected ${SOMAKINE_SCHEMA_VERSION}`);
  requiredString(value, "id", "$", issue);
  requiredString(value, "version", "$", issue);
  requiredString(value, "title", "$", issue);
  requiredString(value, "description", "$", issue);
  isoDate(value.createdAt, "$.createdAt", issue);

  const sources = arrayField(value, "sources", issue);
  const licenses = arrayField(value, "licenses", issue);
  const regions = arrayField(value, "regions", issue);
  const structures = arrayField(value, "structures", issue);
  const relations = arrayField(value, "relations", issue);
  const assets = arrayField(value, "assets", issue);
  const instances = arrayField(value, "meshInstances", issue);
  const representations = arrayField(value, "representations", issue);
  const locales = arrayField(value, "locales", issue);
  for (const [name, items] of [["sources", sources], ["licenses", licenses], ["regions", regions], ["structures", structures]] as const) {
    if (items.length === 0) issue("invalid_value", `$.${name}`, `at least one ${name.slice(0, -1)} is required`);
  }

  const sourceIds = validateSources(sources, issue);
  const licenseIds = validateLicenses(licenses, issue);
  const regionIds = validateRegions(regions, sourceIds, issue);
  const structureInfo = validateStructures(structures, regionIds, sourceIds, issue);
  validateRelations(relations, structureInfo.ids, sourceIds, issue);
  const assetIds = validateAssets(assets, sourceIds, licenseIds, issue);
  const instanceInfo = validateInstances(instances, assetIds, issue);
  validateRepresentations(representations, structureInfo, instanceInfo, sourceIds, issue);
  validateLocales(locales, new Set([...regionIds, ...structureInfo.ids]), issue);
  return { valid: issues.length === 0, issues };
}

export function assertDataPack(value: unknown): asserts value is DataPack {
  const result = validateDataPack(value);
  if (!result.valid) throw new DataPackValidationError(result.issues);
}

function validateSources(items: unknown[], issue: IssueFn): Set<string> {
  const ids = new Set<string>();
  items.forEach((item, index) => {
    const path = `$.sources[${index}]`;
    if (!isRecord(item)) return issue("invalid_type", path, "source must be an object");
    const id = requiredString(item, "id", path, issue);
    unique(id, ids, `${path}.id`, issue);
    requiredString(item, "title", path, issue);
    requiredString(item, "version", path, issue);
    httpUrl(item.url, `${path}.url`, issue);
    isoDate(item.retrievedAt, `${path}.retrievedAt`, issue);
  });
  return ids;
}

function validateLicenses(items: unknown[], issue: IssueFn): Set<string> {
  const ids = new Set<string>();
  items.forEach((item, index) => {
    const path = `$.licenses[${index}]`;
    if (!isRecord(item)) return issue("invalid_type", path, "license must be an object");
    const id = requiredString(item, "id", path, issue);
    unique(id, ids, `${path}.id`, issue);
    requiredString(item, "name", path, issue);
    httpUrl(item.url, `${path}.url`, issue);
    requiredString(item, "attribution", path, issue);
    enumValue(item.redistribution, REDISTRIBUTIONS, `${path}.redistribution`, issue);
  });
  return ids;
}

function validateRegions(items: unknown[], sourceIds: Set<string>, issue: IssueFn): Set<string> {
  const ids = new Set<string>();
  items.forEach((item, index) => {
    const path = `$.regions[${index}]`;
    if (!isRecord(item)) return issue("invalid_type", path, "region must be an object");
    const id = idValue(item.id, ID_PATTERNS.region, `${path}.id`, issue);
    unique(id, ids, `${path}.id`, issue);
    positiveInteger(item.order, `${path}.order`, issue, true);
    references(item.sourceIds, sourceIds, `${path}.sourceIds`, issue, true);
  });
  return ids;
}

interface StructureInfo { ids: Set<string>; laterality: Map<string, Laterality> }

function validateStructures(items: unknown[], regionIds: Set<string>, sourceIds: Set<string>, issue: IssueFn): StructureInfo {
  const ids = new Set<string>();
  const laterality = new Map<string, Laterality>();
  items.forEach((item, index) => {
    const path = `$.structures[${index}]`;
    if (!isRecord(item)) return issue("invalid_type", path, "structure must be an object");
    const id = idValue(item.id, ID_PATTERNS.structure, `${path}.id`, issue);
    unique(id, ids, `${path}.id`, issue);
    enumValue(item.type, STRUCTURE_TYPES, `${path}.type`, issue);
    const side = enumValue(item.laterality, LATERALITIES, `${path}.laterality`, issue);
    if (id && side) laterality.set(id, side);
    references(item.regionIds, regionIds, `${path}.regionIds`, issue, true);
    stringRecord(item.externalIds, `${path}.externalIds`, issue);
    references(item.sourceIds, sourceIds, `${path}.sourceIds`, issue, true);
    enumValue(item.reviewState, REVIEW_STATES, `${path}.reviewState`, issue);
  });
  return { ids, laterality };
}

function validateRelations(items: unknown[], structureIds: Set<string>, sourceIds: Set<string>, issue: IssueFn): void {
  const ids = new Set<string>();
  items.forEach((item, index) => {
    const path = `$.relations[${index}]`;
    if (!isRecord(item)) return issue("invalid_type", path, "relation must be an object");
    const id = idValue(item.id, ID_PATTERNS.relation, `${path}.id`, issue);
    unique(id, ids, `${path}.id`, issue);
    enumValue(item.type, RELATION_TYPES, `${path}.type`, issue);
    reference(item.sourceId, structureIds, `${path}.sourceId`, issue);
    reference(item.targetId, structureIds, `${path}.targetId`, issue);
    if (item.sourceId === item.targetId) issue("invalid_value", path, "relation cannot reference itself");
    references(item.sourceIds, sourceIds, `${path}.sourceIds`, issue, true);
    enumValue(item.reviewState, REVIEW_STATES, `${path}.reviewState`, issue);
  });
}

function validateAssets(items: unknown[], sourceIds: Set<string>, licenseIds: Set<string>, issue: IssueFn): Set<string> {
  const ids = new Set<string>();
  items.forEach((item, index) => {
    const path = `$.assets[${index}]`;
    if (!isRecord(item)) return issue("invalid_type", path, "asset must be an object");
    const id = idValue(item.id, ID_PATTERNS.asset, `${path}.id`, issue);
    unique(id, ids, `${path}.id`, issue);
    references(item.sourceIds, sourceIds, `${path}.sourceIds`, issue, true);
    reference(item.licenseId, licenseIds, `${path}.licenseId`, issue, "missing_provenance");
    if (item.kind === "primitive") validatePrimitiveAsset(item, path, issue);
    else if (item.kind === "gltf") validateGltfAsset(item, path, issue);
    else issue("invalid_value", `${path}.kind`, "asset kind must be primitive or gltf");
  });
  return ids;
}

function validatePrimitiveAsset(item: Record<string, unknown>, path: string, issue: IssueFn): void {
  if (!isRecord(item.primitive)) return issue("invalid_type", `${path}.primitive`, "primitive definition is required");
  enumValue(item.primitive.shape, PRIMITIVE_SHAPES, `${path}.primitive.shape`, issue);
  numberTuple(item.primitive.dimensions, `${path}.primitive.dimensions`, issue, true);
  if (typeof item.primitive.color !== "string" || !HEX_COLOR.test(item.primitive.color)) {
    issue("invalid_value", `${path}.primitive.color`, "color must be a six-digit hex value");
  }
}

function validateGltfAsset(item: Record<string, unknown>, path: string, issue: IssueFn): void {
  if (typeof item.uri !== "string" || !isSafeAssetUri(item.uri)) issue("unsafe_asset_uri", `${path}.uri`, "asset URI must be a safe relative path");
  if (item.mediaType !== "model/gltf-binary" && item.mediaType !== "model/gltf+json") issue("invalid_value", `${path}.mediaType`, "unsupported glTF media type");
  if (typeof item.sha256 !== "string" || !SHA256.test(item.sha256)) issue("invalid_value", `${path}.sha256`, "sha256 must be 64 lowercase hexadecimal characters");
  positiveInteger(item.bytes, `${path}.bytes`, issue);
  if (typeof item.bytes === "number" && item.bytes > SOMAKINE_MAX_ASSET_BYTES) {
    issue("invalid_value", `${path}.bytes`, `asset exceeds the ${SOMAKINE_MAX_ASSET_BYTES}-byte runtime limit`);
  }
  if (!isRecord(item.geometry)) return issue("invalid_type", `${path}.geometry`, "geometry budget is required");
  positiveInteger(item.geometry.vertices, `${path}.geometry.vertices`, issue);
  positiveInteger(item.geometry.gpuBytes, `${path}.geometry.gpuBytes`, issue);
}

interface InstanceInfo { ids: Set<string>; laterality: Map<string, string> }

function validateInstances(items: unknown[], assetIds: Set<string>, issue: IssueFn): InstanceInfo {
  const ids = new Set<string>();
  const laterality = new Map<string, string>();
  items.forEach((item, index) => {
    const path = `$.meshInstances[${index}]`;
    if (!isRecord(item)) return issue("invalid_type", path, "mesh instance must be an object");
    const id = idValue(item.id, ID_PATTERNS.instance, `${path}.id`, issue);
    unique(id, ids, `${path}.id`, issue);
    reference(item.assetId, assetIds, `${path}.assetId`, issue);
    const side = enumValue(item.laterality, INSTANCE_LATERALITIES, `${path}.laterality`, issue);
    if (id && side) laterality.set(id, side);
    if (!isRecord(item.selector)) issue("invalid_type", `${path}.selector`, "selector must be an object");
    else {
      if (item.selector.kind !== "scene" && item.selector.kind !== "node-name") issue("invalid_value", `${path}.selector.kind`, "selector kind must be scene or node-name");
      if (item.selector.kind === "node-name") requiredString(item.selector, "value", `${path}.selector`, issue);
    }
    if (item.transform !== undefined) validateTransform(item.transform, `${path}.transform`, issue);
  });
  return { ids, laterality };
}

function validateRepresentations(items: unknown[], structures: StructureInfo, instances: InstanceInfo, sourceIds: Set<string>, issue: IssueFn): void {
  const ids = new Set<string>();
  const covered = new Set<string>();
  items.forEach((item, index) => {
    const path = `$.representations[${index}]`;
    if (!isRecord(item)) return issue("invalid_type", path, "representation must be an object");
    const id = idValue(item.id, ID_PATTERNS.representation, `${path}.id`, issue);
    unique(id, ids, `${path}.id`, issue);
    const structureId = reference(item.structureId, structures.ids, `${path}.structureId`, issue);
    if (structureId) unique(structureId, covered, `${path}.structureId`, issue);
    const mode = enumValue(item.mode, COVERAGE_MODES, `${path}.mode`, issue);
    const instanceIds = references(item.instanceIds, instances.ids, `${path}.instanceIds`, issue, false);
    const contextIds = references(item.contextStructureIds, structures.ids, `${path}.contextStructureIds`, issue, false);
    references(item.sourceIds, sourceIds, `${path}.sourceIds`, issue, true);
    enumValue(item.reviewState, REVIEW_STATES, `${path}.reviewState`, issue);
    if ((mode === "direct" || mode === "compound") && instanceIds.length === 0) issue("invalid_coverage", path, `${mode} representation requires mesh instances`);
    if ((mode === "direct" || mode === "compound") && contextIds.length > 0) issue("invalid_coverage", path, `${mode} representation cannot claim contextual structures`);
    if (mode === "compound" && instanceIds.length < 2) issue("invalid_coverage", path, "compound representation requires at least two mesh instances");
    if (mode === "context" && (instanceIds.length > 0 || contextIds.length === 0)) issue("invalid_coverage", path, "context representation requires related structures and no target instances");
    if (mode === "unavailable" && (instanceIds.length > 0 || contextIds.length > 0)) issue("invalid_coverage", path, "unavailable representation cannot reference geometry");
    if (structureId && contextIds.includes(structureId)) issue("invalid_coverage", path, "a structure cannot be its own context");
    if (structureId) validateRepresentationLaterality(structureId, instanceIds, structures, instances, path, issue);
  });
  for (const structureId of structures.ids) if (!covered.has(structureId)) issue("invalid_coverage", "$.representations", `missing coverage for ${structureId}`);
}

function validateRepresentationLaterality(structureId: string, instanceIds: string[], structures: StructureInfo, instances: InstanceInfo, path: string, issue: IssueFn): void {
  const structureLaterality = structures.laterality.get(structureId);
  const sides = new Set(instanceIds.map((id) => instances.laterality.get(id)).filter(Boolean));
  if (structureLaterality === "midline" && [...sides].some((side) => side === "left" || side === "right")) issue("invalid_laterality", path, "midline structure cannot use unilateral mesh instances");
  if (structureLaterality === "paired" && sides.has("none")) issue("invalid_laterality", path, "paired structure cannot use a non-lateral mesh instance");
}

function validateLocales(items: unknown[], knownIds: Set<string>, issue: IssueFn): void {
  const locales = new Set<string>();
  items.forEach((item, index) => {
    const path = `$.locales[${index}]`;
    if (!isRecord(item)) return issue("invalid_type", path, "locale pack must be an object");
    const locale = requiredString(item, "locale", path, issue);
    unique(locale, locales, `${path}.locale`, issue);
    const labels = stringRecord(item.labels, `${path}.labels`, issue);
    for (const id of knownIds) if (!labels[id]) issue("broken_reference", `${path}.labels`, `missing label for ${id}`);
    if (!isRecord(item.aliases)) issue("invalid_type", `${path}.aliases`, "aliases must be an object");
    else for (const [id, aliases] of Object.entries(item.aliases)) {
      if (!knownIds.has(id)) issue("broken_reference", `${path}.aliases.${id}`, "alias references unknown ID");
      if (!Array.isArray(aliases) || aliases.some((alias) => typeof alias !== "string" || alias.length === 0)) issue("invalid_type", `${path}.aliases.${id}`, "aliases must be non-empty strings");
    }
  });
  if (items.length === 0) issue("invalid_value", "$.locales", "at least one locale pack is required");
}

function validateTransform(value: unknown, path: string, issue: IssueFn): void {
  if (!isRecord(value)) return issue("invalid_type", path, "transform must be an object");
  if (value.position !== undefined) numberTuple(value.position, `${path}.position`, issue, false);
  if (value.rotation !== undefined) numberTuple(value.rotation, `${path}.rotation`, issue, false);
  if (value.scale !== undefined) numberTuple(value.scale, `${path}.scale`, issue, true);
}

export function isSafeAssetUri(uri: string): boolean {
  if (!uri || uri.startsWith("/") || uri.startsWith("\\") || uri.includes("\\") || uri.includes("\0")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(uri)) return false;
  return uri.split("/").every((segment) => /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(segment));
}

type IssueFn = (code: ValidationCode, path: string, message: string) => void;

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }
function arrayField(value: Record<string, unknown>, key: string, issue: IssueFn): unknown[] {
  const field = value[key];
  if (!Array.isArray(field)) { issue("invalid_type", `$.${key}`, `${key} must be an array`); return [] }
  return field;
}
function requiredString(value: Record<string, unknown>, key: string, path: string, issue: IssueFn): string {
  const field = value[key];
  if (typeof field !== "string" || field.trim().length === 0) { issue("invalid_type", `${path}.${key}`, `${key} must be a non-empty string`); return "" }
  return field;
}
function idValue(value: unknown, pattern: RegExp, path: string, issue: IssueFn): string {
  if (typeof value !== "string" || !pattern.test(value)) { issue("invalid_id", path, "ID does not match the required Somakine namespace"); return "" }
  return value;
}
function unique(value: string, ids: Set<string>, path: string, issue: IssueFn): void {
  if (!value) return;
  if (ids.has(value)) issue("duplicate_id", path, `duplicate ID: ${value}`); else ids.add(value);
}
function reference(value: unknown, ids: Set<string>, path: string, issue: IssueFn, code: ValidationCode = "broken_reference"): string {
  if (typeof value !== "string" || !ids.has(value)) { issue(code, path, `unknown reference: ${String(value)}`); return "" }
  return value;
}
function references(value: unknown, ids: Set<string>, path: string, issue: IssueFn, requireNonEmpty: boolean): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) { issue("invalid_type", path, "references must be an array of strings"); return [] }
  if (requireNonEmpty && value.length === 0) issue("missing_provenance", path, "at least one reference is required");
  const seen = new Set<string>();
  for (const entry of value as string[]) { if (seen.has(entry)) issue("duplicate_id", path, `duplicate reference: ${entry}`); seen.add(entry); if (!ids.has(entry)) issue("broken_reference", path, `unknown reference: ${entry}`) }
  return value as string[];
}
function enumValue<T extends string>(value: unknown, allowed: Set<T>, path: string, issue: IssueFn): T | "" {
  if (typeof value !== "string" || !allowed.has(value as T)) { issue("invalid_value", path, `unsupported value: ${String(value)}`); return "" }
  return value as T;
}
function positiveInteger(value: unknown, path: string, issue: IssueFn, allowZero = false): void {
  if (!Number.isSafeInteger(value) || (value as number) < (allowZero ? 0 : 1)) issue("invalid_value", path, `value must be a ${allowZero ? "non-negative" : "positive"} safe integer`);
}
function numberTuple(value: unknown, path: string, issue: IssueFn, positive: boolean): void {
  if (!Array.isArray(value) || value.length !== 3 || value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry) || (positive && entry <= 0))) issue("invalid_value", path, `value must be a three-number tuple${positive ? " with positive values" : ""}`);
}
function stringRecord(value: unknown, path: string, issue: IssueFn): Record<string, string> {
  if (!isRecord(value) || Object.values(value).some((entry) => typeof entry !== "string" || entry.length === 0)) { issue("invalid_type", path, "value must be an object of non-empty strings"); return {} }
  return value as Record<string, string>;
}
function isoDate(value: unknown, path: string, issue: IssueFn): void {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) issue("invalid_value", path, "value must be an ISO-8601 UTC timestamp");
}
function httpUrl(value: unknown, path: string, issue: IssueFn): void {
  if (typeof value !== "string") return issue("invalid_type", path, "URL must be a string");
  try { const url = new URL(value); if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported protocol") }
  catch { issue("invalid_value", path, "URL must use http or https") }
}

export function cloneDataPack(pack: DataPack): DataPack { return structuredClone(pack) }
export function assetHasRuntimeFile(asset: Asset): asset is Extract<Asset, { kind: "gltf" }> { return asset.kind === "gltf" }
