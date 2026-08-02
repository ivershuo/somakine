import { DataExtensionValidationError, type ValidationCode, type ValidationIssue } from "./errors.js";
import {
  SOMAKINE_MAX_ASSET_BYTES,
  SOMAKINE_SCHEMA_VERSION,
  type Asset,
  type ComposedDataPack,
  type CompositionConflictPolicy,
  type CompositionReport,
  type DataExtension,
  type DataPack,
  type ExtensionMatch,
  type LocalePack,
  type Laterality,
  type MeshInstance,
  type Relation,
  type Region,
  type Representation,
  type ReviewState,
  type Structure,
} from "./model.js";
import { assertDataPack, isSafeAssetUri, type ValidationResult } from "./validation.js";

const ID_PATTERNS = {
  region: /^somakine:region:[a-z0-9]+(?:-[a-z0-9]+)*$/,
  structure: /^somakine:structure:[a-z0-9]+(?:-[a-z0-9]+)*$/,
  relation: /^somakine:relation:[a-z0-9]+(?:-[a-z0-9]+)*$/,
  representation: /^somakine:representation:[a-z0-9]+(?:-[a-z0-9]+)*$/,
  instance: /^somakine:instance:[a-z0-9]+(?:-[a-z0-9]+)*$/,
  asset: /^somakine:asset:[a-z0-9]+(?:[-:][a-z0-9]+)*$/,
} as const;

const NAMESPACE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STRUCTURE_TYPES = new Set(["bone", "joint", "ligament", "muscle", "tendon", "skin"]);
const LATERALITIES = new Set(["none", "paired", "midline", "variable"]);
const INSTANCE_LATERALITIES = new Set(["none", "left", "right", "bilateral"]);
const RELATION_TYPES = new Set(["part_of", "articulates_with", "attaches_to", "originates_from", "inserts_into", "crosses", "contains"]);
const COVERAGE_MODES = new Set(["direct", "compound", "context", "unavailable"]);
const REVIEW_STATES = new Set<ReviewState>(["unreviewed", "source-reviewed", "expert-reviewed"]);
const EXTENSION_MATCHES = new Set<ExtensionMatch>(["exact", "synonym", "expert-reviewed"]);
const PRIMITIVE_SHAPES = new Set(["box", "sphere", "cylinder", "capsule"]);
const REDISTRIBUTIONS = new Set(["permissive", "attribution", "share-alike", "restricted"]);
const SHA256 = /^[0-9a-f]{64}$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const REVIEW_RANK: Record<ReviewState, number> = {
  unreviewed: 0,
  "source-reviewed": 1,
  "expert-reviewed": 2,
};

export interface ComposeDataPackOptions {
  conflictPolicy?: CompositionConflictPolicy;
}

const DEFAULT_CONFLICT_POLICY: CompositionConflictPolicy = "fill-unavailable";

export function validateDataExtension(value: unknown, base?: DataPack): ValidationResult {
  const issues: ValidationIssue[] = [];
  const issue: IssueFn = (code, path, message) => issues.push({ code, path, message });
  if (!isRecord(value)) {
    issue("invalid_type", "$", "data extension must be an object");
    return { valid: false, issues };
  }

  if (value.schemaVersion !== SOMAKINE_SCHEMA_VERSION) issue("unsupported_schema", "$.schemaVersion", `expected ${SOMAKINE_SCHEMA_VERSION}`);
  requiredString(value, "id", "$", issue);
  requiredString(value, "version", "$", issue);
  requiredString(value, "title", "$", issue);
  requiredString(value, "description", "$", issue);
  isoDate(value.createdAt, "$.createdAt", issue);
  const namespace = requiredString(value, "namespace", "$", issue);
  if (namespace && !NAMESPACE_PATTERN.test(namespace)) issue("invalid_extension", "$.namespace", "namespace must contain lowercase letters, numbers, and hyphens");

  const targetPack = value.targetPack;
  if (!isRecord(targetPack)) issue("invalid_extension", "$.targetPack", "targetPack is required");
  else {
    requiredString(targetPack, "id", "$.targetPack", issue);
    if (targetPack.version !== undefined) requiredString(targetPack, "version", "$.targetPack", issue);
    if (base && targetPack.id !== base.id) issue("invalid_extension", "$.targetPack.id", `extension targets ${String(targetPack.id)}, expected ${base.id}`);
    if (base && typeof targetPack.version === "string" && targetPack.version !== base.version) {
      issue("invalid_extension", "$.targetPack.version", `extension targets version ${targetPack.version}, expected ${base.version}`);
    }
  }

  const sources = arrayField(value, "sources", issue);
  const licenses = arrayField(value, "licenses", issue);
  const regions = arrayField(value, "regions", issue);
  const structures = arrayField(value, "structures", issue);
  const relations = arrayField(value, "relations", issue);
  const assets = arrayField(value, "assets", issue);
  const instances = arrayField(value, "meshInstances", issue);
  const representations = arrayField(value, "representations", issue);
  const locales = arrayField(value, "locales", issue);
  const mappings = arrayField(value, "mappings", issue);

  if (sources.length === 0) issue("invalid_value", "$.sources", "at least one source is required");
  if (licenses.length === 0) issue("invalid_value", "$.licenses", "at least one license is required");

  const sourceIds = validateSources(sources, issue);
  const licenseIds = validateLicenses(licenses, issue);
  const baseRegionIds = new Set(base?.regions.map((region) => region.id) ?? []);
  const baseStructureIds = new Set(base?.structures.map((structure) => structure.id) ?? []);
  const regionIds = validateRegions(regions, namespace, sourceIds, baseRegionIds, issue);
  const structureInfo = validateStructures(structures, namespace, [...regionIds, ...baseRegionIds], sourceIds, issue);
  const allStructureIds = new Set([...structureInfo.ids, ...baseStructureIds]);
  validateRelations(relations, namespace, allStructureIds, sourceIds, issue);
  const assetIds = validateAssets(assets, namespace, sourceIds, licenseIds, issue);
  const instanceInfo = validateInstances(instances, namespace, assetIds, issue);
  const structureLaterality = new Map<string, Laterality>(base?.structures.map((structure) => [structure.id, structure.laterality]) ?? []);
  for (const structure of structures) {
    if (isRecord(structure) && typeof structure.id === "string" && typeof structure.laterality === "string") {
      structureLaterality.set(structure.id, structure.laterality as Laterality);
    }
  }
  validateRepresentations(representations, namespace, allStructureIds, structureInfo.ids, instanceInfo.ids, instanceInfo.laterality, structureLaterality, sourceIds, issue);
  validateLocales(locales, allStructureIds, [...regionIds, ...baseRegionIds], issue, !base);
  validateMappings(mappings, baseStructureIds, sourceIds, issue);

  return { valid: issues.length === 0, issues };
}

export function assertDataExtension(value: unknown, base?: DataPack): asserts value is DataExtension {
  const result = validateDataExtension(value, base);
  if (!result.valid) throw new DataExtensionValidationError(result.issues);
}

export function composeDataPacks(
  base: DataPack,
  extensions: readonly DataExtension[],
  options: ComposeDataPackOptions = {},
): ComposedDataPack {
  assertDataPack(base);
  const conflictPolicy = options.conflictPolicy ?? DEFAULT_CONFLICT_POLICY;
  if (!new Set(["fill-unavailable", "prefer-extension", "error-on-conflict"]).has(conflictPolicy)) {
    throw compositionError(`unsupported conflict policy: ${String(conflictPolicy)}`);
  }

  const dataset = structuredClone(base);
  const baseStructureIds = new Set(base.structures.map((structure) => structure.id));
  const seenExtensionIds = new Set<string>();
  const seenNamespaces = new Set<string>();
  const report: MutableCompositionReport = {
    basePackId: base.id,
    extensionIds: [],
    addedRegionIds: [],
    addedStructureIds: [],
    addedRelationIds: [],
    addedAssetIds: [],
    addedInstanceIds: [],
    replacedRepresentationIds: [],
    deduplicatedRelationIds: [],
  };

  for (const extension of extensions) {
    assertDataExtension(extension, dataset);
    if (seenExtensionIds.has(extension.id)) throw compositionError(`duplicate extension ID: ${extension.id}`);
    if (seenNamespaces.has(extension.namespace)) throw compositionError(`duplicate extension namespace: ${extension.namespace}`);
    seenExtensionIds.add(extension.id);
    seenNamespaces.add(extension.namespace);
    report.extensionIds.push(extension.id);

    for (const mapping of extension.mappings) {
      if (!baseStructureIds.has(mapping.targetStructureId)) {
        throw compositionError(`mapping target must belong to the base pack: ${mapping.targetStructureId}`);
      }
    }
    const mappings = new Set(extension.mappings.map((mapping) => mapping.targetStructureId));
    for (const representation of extension.representations) {
      if (baseStructureIds.has(representation.structureId) && !mappings.has(representation.structureId)) {
        throw compositionError(`representation for existing structure requires a mapping: ${representation.structureId}`);
      }
    }

    ensureRegistryIdsAvailable(extension.sources, dataset.sources, "source");
    ensureRegistryIdsAvailable(extension.licenses, dataset.licenses, "license");
    ensureRegistryIdsAvailable(extension.regions, dataset.regions, "region");
    ensureRegistryIdsAvailable(extension.structures, dataset.structures, "structure");
    ensureRegistryIdsAvailable(extension.relations, dataset.relations, "relation");
    ensureRegistryIdsAvailable(extension.assets, dataset.assets, "asset");
    ensureRegistryIdsAvailable(extension.meshInstances, dataset.meshInstances, "mesh instance");
    ensureRegistryIdsAvailable(extension.representations, dataset.representations, "representation");
    ensureAssetUrisAvailable(extension.assets, dataset.assets);

    dataset.sources.push(...structuredClone(extension.sources));
    dataset.licenses.push(...structuredClone(extension.licenses));

    const currentMaxOrder = Math.max(0, ...dataset.regions.map((region) => region.order));
    const regions = extension.regions.map((region) => ({
      ...structuredClone(region),
      order: currentMaxOrder + Math.max(1, region.order),
    }));
    dataset.regions.push(...regions);
    report.addedRegionIds.push(...regions.map((region) => region.id));

    const structures = structuredClone(extension.structures);
    dataset.structures.push(...structures);
    report.addedStructureIds.push(...structures.map((structure) => structure.id));

    for (const relation of extension.relations) {
      const key = relationKey(relation);
      const duplicate = dataset.relations.find((candidate) => relationKey(candidate) === key);
      if (duplicate) {
        duplicate.sourceIds = uniqueStrings([...duplicate.sourceIds, ...relation.sourceIds]);
        duplicate.reviewState = strongerReviewState(duplicate.reviewState, relation.reviewState);
        report.deduplicatedRelationIds.push(relation.id);
      } else {
        dataset.relations.push(structuredClone(relation));
        report.addedRelationIds.push(relation.id);
      }
    }

    const assets = structuredClone(extension.assets);
    dataset.assets.push(...assets);
    report.addedAssetIds.push(...assets.map((asset) => asset.id));
    const instances = structuredClone(extension.meshInstances);
    dataset.meshInstances.push(...instances);
    report.addedInstanceIds.push(...instances.map((instance) => instance.id));

    for (const representation of extension.representations) {
      const existingIndex = dataset.representations.findIndex((candidate) => candidate.structureId === representation.structureId);
      if (existingIndex === -1) {
        dataset.representations.push(structuredClone(representation));
        continue;
      }
      const existing = dataset.representations[existingIndex];
      if (!existing) throw compositionError(`missing representation at index ${existingIndex}`);
      if (shouldReplaceRepresentation(existing.mode, representation.mode, conflictPolicy)) {
        dataset.representations[existingIndex] = structuredClone(representation);
        report.replacedRepresentationIds.push(representation.id);
      } else {
        throw compositionError(
          `representation conflict for ${representation.structureId}: ${existing.mode} cannot be replaced by ${representation.mode} under ${conflictPolicy}`,
        );
      }
    }

    mergeLocales(dataset.locales, extension.locales, new Set([
      ...dataset.regions.map((region) => region.id),
      ...dataset.structures.map((structure) => structure.id),
    ]));
  }

  assertDataPack(dataset);
  return { dataset, report: freezeReport(report) };
}

function shouldReplaceRepresentation(
  existing: Representation["mode"],
  incoming: Representation["mode"],
  policy: CompositionConflictPolicy,
): boolean {
  if (incoming === "unavailable") return false;
  if (policy === "error-on-conflict") return false;
  if (policy === "prefer-extension") return incoming === "direct" || incoming === "compound" || existing === "unavailable";
  if (existing === "unavailable") return true;
  return existing === "context" && (incoming === "direct" || incoming === "compound");
}

function mergeLocales(base: LocalePack[], extension: readonly LocalePack[], knownIds: Set<string>): void {
  for (const incoming of extension) {
    for (const id of Object.keys(incoming.labels)) if (!knownIds.has(id)) throw compositionError(`locale label references unknown ID: ${id}`);
    for (const id of Object.keys(incoming.aliases)) if (!knownIds.has(id)) throw compositionError(`locale alias references unknown ID: ${id}`);
    const current = base.find((locale) => locale.locale === incoming.locale);
    if (!current) {
      base.push(structuredClone(incoming));
      continue;
    }
    for (const [id, label] of Object.entries(incoming.labels)) {
      if (!knownIds.has(id)) throw compositionError(`locale label references unknown ID: ${id}`);
      if (current.labels[id] !== undefined && current.labels[id] !== label) {
        throw compositionError(`locale label conflict for ${id} (${incoming.locale})`);
      }
      current.labels[id] = label;
    }
    for (const [id, aliases] of Object.entries(incoming.aliases)) {
      if (!knownIds.has(id)) throw compositionError(`locale alias references unknown ID: ${id}`);
      current.aliases[id] = uniqueStrings([...(current.aliases[id] ?? []), ...aliases]);
    }
  }
}

function ensureRegistryIdsAvailable<T extends { id: string }>(incoming: readonly T[], current: readonly T[], kind: string): void {
  const ids = new Set(current.map((item) => item.id));
  for (const item of incoming) if (ids.has(item.id)) throw compositionError(`${kind} ID collision: ${item.id}`);
}

function ensureAssetUrisAvailable(incoming: readonly Asset[], current: readonly Asset[]): void {
  const uris = new Set(current.flatMap((asset) => asset.kind === "gltf" ? [asset.uri] : []));
  for (const asset of incoming) {
    if (asset.kind !== "gltf") continue;
    if (uris.has(asset.uri)) throw compositionError(`asset URI collision: ${asset.uri}`);
    uris.add(asset.uri);
  }
}

function relationKey(relation: Relation): string {
  return `${relation.type}|${relation.sourceId}|${relation.targetId}`;
}

function strongerReviewState(left: ReviewState, right: ReviewState): ReviewState {
  return REVIEW_RANK[left] >= REVIEW_RANK[right] ? left : right;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function freezeReport(report: MutableCompositionReport): CompositionReport {
  return {
    basePackId: report.basePackId,
    extensionIds: Object.freeze([...report.extensionIds]),
    addedRegionIds: Object.freeze([...report.addedRegionIds]),
    addedStructureIds: Object.freeze([...report.addedStructureIds]),
    addedRelationIds: Object.freeze([...report.addedRelationIds]),
    addedAssetIds: Object.freeze([...report.addedAssetIds]),
    addedInstanceIds: Object.freeze([...report.addedInstanceIds]),
    replacedRepresentationIds: Object.freeze([...report.replacedRepresentationIds]),
    deduplicatedRelationIds: Object.freeze([...report.deduplicatedRelationIds]),
  };
}

interface MutableCompositionReport {
  basePackId: string;
  extensionIds: string[];
  addedRegionIds: Region["id"][];
  addedStructureIds: Structure["id"][];
  addedRelationIds: Relation["id"][];
  addedAssetIds: Asset["id"][];
  addedInstanceIds: MeshInstance["id"][];
  replacedRepresentationIds: Representation["id"][];
  deduplicatedRelationIds: Relation["id"][];
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

function validateRegions(items: unknown[], namespace: string, sourceIds: Set<string>, baseRegionIds: Set<string>, issue: IssueFn): Set<string> {
  const ids = new Set<string>();
  items.forEach((item, index) => {
    const path = `$.regions[${index}]`;
    if (!isRecord(item)) return issue("invalid_type", path, "region must be an object");
    const id = idValue(item.id, ID_PATTERNS.region, `${path}.id`, issue);
    assertOwnedId(id, `somakine:region:${namespace}-`, `${path}.id`, issue);
    unique(id, ids, `${path}.id`, issue);
    positiveInteger(item.order, `${path}.order`, issue, true);
    references(item.sourceIds, sourceIds, `${path}.sourceIds`, issue, true);
  });
  return new Set([...ids, ...baseRegionIds]);
}

function validateStructures(items: unknown[], namespace: string, regionIds: string[], sourceIds: Set<string>, issue: IssueFn): StructureInfo {
  const ids = new Set<string>();
  const laterality = new Map<string, Laterality>();
  const regionSet = new Set(regionIds);
  items.forEach((item, index) => {
    const path = `$.structures[${index}]`;
    if (!isRecord(item)) return issue("invalid_type", path, "structure must be an object");
    const id = idValue(item.id, ID_PATTERNS.structure, `${path}.id`, issue);
    assertOwnedId(id, `somakine:structure:${namespace}-`, `${path}.id`, issue);
    unique(id, ids, `${path}.id`, issue);
    enumValue(item.type, STRUCTURE_TYPES, `${path}.type`, issue);
    const side = enumValue(item.laterality, LATERALITIES, `${path}.laterality`, issue);
    if (side) laterality.set(id, side as Laterality);
    references(item.regionIds, regionSet, `${path}.regionIds`, issue, true);
    stringRecord(item.externalIds, `${path}.externalIds`, issue);
    references(item.sourceIds, sourceIds, `${path}.sourceIds`, issue, true);
    enumValue(item.reviewState, REVIEW_STATES, `${path}.reviewState`, issue);
  });
  return { ids, laterality };
}

interface StructureInfo {
  ids: Set<string>;
  laterality: Map<string, Laterality>;
}

function validateRelations(items: unknown[], namespace: string, structureIds: Set<string>, sourceIds: Set<string>, issue: IssueFn): void {
  const ids = new Set<string>();
  items.forEach((item, index) => {
    const path = `$.relations[${index}]`;
    if (!isRecord(item)) return issue("invalid_type", path, "relation must be an object");
    const id = idValue(item.id, ID_PATTERNS.relation, `${path}.id`, issue);
    assertOwnedId(id, `somakine:relation:${namespace}-`, `${path}.id`, issue);
    unique(id, ids, `${path}.id`, issue);
    enumValue(item.type, RELATION_TYPES, `${path}.type`, issue);
    const source = reference(item.sourceId, structureIds, `${path}.sourceId`, issue);
    const target = reference(item.targetId, structureIds, `${path}.targetId`, issue);
    if (source && source === target) issue("invalid_value", path, "relation cannot reference itself");
    references(item.sourceIds, sourceIds, `${path}.sourceIds`, issue, true);
    enumValue(item.reviewState, REVIEW_STATES, `${path}.reviewState`, issue);
  });
}

function validateAssets(items: unknown[], namespace: string, sourceIds: Set<string>, licenseIds: Set<string>, issue: IssueFn): Set<string> {
  const ids = new Set<string>();
  items.forEach((item, index) => {
    const path = `$.assets[${index}]`;
    if (!isRecord(item)) return issue("invalid_type", path, "asset must be an object");
    const id = idValue(item.id, ID_PATTERNS.asset, `${path}.id`, issue);
    assertOwnedId(id, `somakine:asset:${namespace}:`, `${path}.id`, issue);
    unique(id, ids, `${path}.id`, issue);
    references(item.sourceIds, sourceIds, `${path}.sourceIds`, issue, true);
    reference(item.licenseId, licenseIds, `${path}.licenseId`, issue, "missing_provenance");
    if (item.kind === "primitive") validatePrimitive(item, path, issue);
    else if (item.kind === "gltf") validateGltf(item, path, issue);
    else issue("invalid_value", `${path}.kind`, "asset kind must be primitive or gltf");
  });
  return ids;
}

function validatePrimitive(item: Record<string, unknown>, path: string, issue: IssueFn): void {
  if (!isRecord(item.primitive)) return issue("invalid_type", `${path}.primitive`, "primitive definition is required");
  enumValue(item.primitive.shape, PRIMITIVE_SHAPES, `${path}.primitive.shape`, issue);
  numberTuple(item.primitive.dimensions, `${path}.primitive.dimensions`, issue, true);
  if (typeof item.primitive.color !== "string" || !HEX_COLOR.test(item.primitive.color)) issue("invalid_value", `${path}.primitive.color`, "color must be a six-digit hex value");
}

function validateGltf(item: Record<string, unknown>, path: string, issue: IssueFn): void {
  if (typeof item.uri !== "string" || !isSafeAssetUri(item.uri)) issue("unsafe_asset_uri", `${path}.uri`, "asset URI must be a safe relative path");
  if (item.mediaType !== "model/gltf-binary" && item.mediaType !== "model/gltf+json") issue("invalid_value", `${path}.mediaType`, "unsupported glTF media type");
  if (typeof item.sha256 !== "string" || !SHA256.test(item.sha256)) issue("invalid_value", `${path}.sha256`, "sha256 must be 64 lowercase hexadecimal characters");
  positiveInteger(item.bytes, `${path}.bytes`, issue);
  if (typeof item.bytes === "number" && item.bytes > SOMAKINE_MAX_ASSET_BYTES) issue("invalid_value", `${path}.bytes`, `asset exceeds the ${SOMAKINE_MAX_ASSET_BYTES}-byte runtime limit`);
  if (!isRecord(item.geometry)) return issue("invalid_type", `${path}.geometry`, "geometry budget is required");
  positiveInteger(item.geometry.vertices, `${path}.geometry.vertices`, issue);
  positiveInteger(item.geometry.gpuBytes, `${path}.geometry.gpuBytes`, issue);
}

function validateInstances(items: unknown[], namespace: string, assetIds: Set<string>, issue: IssueFn): InstanceInfo {
  const ids = new Set<string>();
  const laterality = new Map<string, string>();
  items.forEach((item, index) => {
    const path = `$.meshInstances[${index}]`;
    if (!isRecord(item)) return issue("invalid_type", path, "mesh instance must be an object");
    const id = idValue(item.id, ID_PATTERNS.instance, `${path}.id`, issue);
    assertOwnedId(id, `somakine:instance:${namespace}-`, `${path}.id`, issue);
    unique(id, ids, `${path}.id`, issue);
    reference(item.assetId, assetIds, `${path}.assetId`, issue);
    const side = enumValue(item.laterality, INSTANCE_LATERALITIES, `${path}.laterality`, issue);
    if (side) laterality.set(id, side);
    if (!isRecord(item.selector)) issue("invalid_type", `${path}.selector`, "selector must be an object");
    else {
      if (item.selector.kind !== "scene" && item.selector.kind !== "node-name") issue("invalid_value", `${path}.selector.kind`, "selector kind must be scene or node-name");
      if (item.selector.kind === "node-name") requiredString(item.selector, "value", `${path}.selector`, issue);
    }
    if (item.transform !== undefined) validateTransform(item.transform, `${path}.transform`, issue);
  });
  return { ids, laterality };
}

interface InstanceInfo {
  ids: Set<string>;
  laterality: Map<string, string>;
}

function validateRepresentations(
  items: unknown[],
  namespace: string,
  allStructureIds: Set<string>,
  extensionStructureIds: Set<string>,
  instanceIds: Set<string>,
  instanceLaterality: Map<string, string>,
  structureLaterality: Map<string, Laterality>,
  sourceIds: Set<string>,
  issue: IssueFn,
): void {
  const ids = new Set<string>();
  const covered = new Set<string>();
  items.forEach((item, index) => {
    const path = `$.representations[${index}]`;
    if (!isRecord(item)) return issue("invalid_type", path, "representation must be an object");
    const id = idValue(item.id, ID_PATTERNS.representation, `${path}.id`, issue);
    assertOwnedId(id, `somakine:representation:${namespace}-`, `${path}.id`, issue);
    unique(id, ids, `${path}.id`, issue);
    const structureId = reference(item.structureId, allStructureIds, `${path}.structureId`, issue);
    if (structureId && extensionStructureIds.has(structureId)) covered.add(structureId);
    const mode = enumValue(item.mode, COVERAGE_MODES, `${path}.mode`, issue);
    const instanceRefs = references(item.instanceIds, instanceIds, `${path}.instanceIds`, issue, false);
    const contextRefs = references(item.contextStructureIds, allStructureIds, `${path}.contextStructureIds`, issue, false);
    references(item.sourceIds, sourceIds, `${path}.sourceIds`, issue, true);
    enumValue(item.reviewState, REVIEW_STATES, `${path}.reviewState`, issue);
    if ((mode === "direct" || mode === "compound") && instanceRefs.length === 0) issue("invalid_coverage", path, `${mode} representation requires mesh instances`);
    if ((mode === "direct" || mode === "compound") && contextRefs.length > 0) issue("invalid_coverage", path, `${mode} representation cannot claim contextual structures`);
    if (mode === "compound" && instanceRefs.length < 2) issue("invalid_coverage", path, "compound representation requires at least two mesh instances");
    if (mode === "context" && (instanceRefs.length > 0 || contextRefs.length === 0)) issue("invalid_coverage", path, "context representation requires related structures and no target instances");
    if (mode === "unavailable" && (instanceRefs.length > 0 || contextRefs.length > 0)) issue("invalid_coverage", path, "unavailable representation cannot reference geometry");
    if (structureId && contextRefs.includes(structureId)) issue("invalid_coverage", path, "a structure cannot be its own context");
    validateRepresentationLaterality(structureId, instanceRefs, structureLaterality, instanceLaterality, path, issue);
  });
  for (const structureId of extensionStructureIds) if (!covered.has(structureId)) issue("invalid_coverage", "$.representations", `missing coverage for extension structure ${structureId}`);
}

function validateRepresentationLaterality(
  structureId: string,
  instanceIds: string[],
  structureLaterality: Map<string, Laterality>,
  instanceLaterality: Map<string, string>,
  path: string,
  issue: IssueFn,
): void {
  if (!structureId) return;
  const structureSide = structureLaterality.get(structureId);
  const sides = new Set(instanceIds.map((id) => instanceLaterality.get(id)).filter((side): side is string => Boolean(side)));
  if (structureSide === undefined || sides.size === 0) return;
  if (structureSide === "midline" && [...sides].some((side) => side === "left" || side === "right")) issue("invalid_laterality", path, "midline structure cannot use unilateral mesh instances");
  if (structureSide === "paired" && sides.has("none")) issue("invalid_laterality", path, "paired structure cannot use a non-lateral mesh instance");
}

function validateLocales(items: unknown[], structureIds: Set<string>, regionIds: string[], issue: IssueFn, allowPartial: boolean): void {
  const knownIds = new Set([...structureIds, ...regionIds]);
  const locales = new Set<string>();
  items.forEach((item, index) => {
    const path = `$.locales[${index}]`;
    if (!isRecord(item)) return issue("invalid_type", path, "locale pack must be an object");
    const locale = requiredString(item, "locale", path, issue);
    unique(locale, locales, `${path}.locale`, issue);
    if (!isRecord(item.labels)) issue("invalid_type", `${path}.labels`, "labels must be an object");
    else for (const [id, label] of Object.entries(item.labels)) {
      if (typeof label !== "string" || label.length === 0) issue("invalid_type", `${path}.labels.${id}`, "label must be a non-empty string");
      if (!knownIds.has(id) && !allowPartial) issue("broken_reference", `${path}.labels.${id}`, "label references unknown ID");
    }
    if (!isRecord(item.aliases)) issue("invalid_type", `${path}.aliases`, "aliases must be an object");
    else for (const [id, aliases] of Object.entries(item.aliases)) {
      if (!knownIds.has(id) && !allowPartial) issue("broken_reference", `${path}.aliases.${id}`, "alias references unknown ID");
      if (!Array.isArray(aliases) || aliases.some((alias) => typeof alias !== "string" || alias.length === 0)) issue("invalid_type", `${path}.aliases.${id}`, "aliases must be non-empty strings");
    }
  });
}

function validateMappings(items: unknown[], baseStructureIds: Set<string>, sourceIds: Set<string>, issue: IssueFn): void {
  const targets = new Set<string>();
  items.forEach((item, index) => {
    const path = `$.mappings[${index}]`;
    if (!isRecord(item)) return issue("invalid_type", path, "mapping must be an object");
    const target = idValue(item.targetStructureId, ID_PATTERNS.structure, `${path}.targetStructureId`, issue);
    if (baseStructureIds.size > 0 && target && !baseStructureIds.has(target)) issue("invalid_extension", `${path}.targetStructureId`, `mapping target is not in the base pack: ${target}`);
    unique(target, targets, `${path}.targetStructureId`, issue);
    enumValue(item.match, EXTENSION_MATCHES, `${path}.match`, issue);
    if (typeof item.confidence !== "number" || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) issue("invalid_value", `${path}.confidence`, "confidence must be between 0 and 1");
    references(item.sourceIds, sourceIds, `${path}.sourceIds`, issue, true);
    enumValue(item.reviewState, REVIEW_STATES, `${path}.reviewState`, issue);
  });
}

function assertOwnedId(id: string, prefix: string, path: string, issue: IssueFn): void {
  if (id && !id.startsWith(prefix)) issue("invalid_extension", path, `extension-owned ID must start with ${prefix}`);
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function arrayField(value: Record<string, unknown>, key: string, issue: IssueFn): unknown[] {
  const field = value[key];
  if (!Array.isArray(field)) { issue("invalid_type", `$.${key}`, `${key} must be an array`); return []; }
  return field;
}
function requiredString(value: Record<string, unknown>, key: string, path: string, issue: IssueFn): string {
  const field = value[key];
  if (typeof field !== "string" || field.trim().length === 0) { issue("invalid_type", `${path}.${key}`, `${key} must be a non-empty string`); return ""; }
  return field;
}
function idValue(value: unknown, pattern: RegExp, path: string, issue: IssueFn): string {
  if (typeof value !== "string" || !pattern.test(value)) { issue("invalid_id", path, "ID does not match the required Somakine namespace"); return ""; }
  return value;
}
function unique(value: string, ids: Set<string>, path: string, issue: IssueFn): void {
  if (!value) return;
  if (ids.has(value)) issue("duplicate_id", path, `duplicate ID: ${value}`); else ids.add(value);
}
function reference(value: unknown, ids: Set<string>, path: string, issue: IssueFn, code: ValidationCode = "broken_reference"): string {
  if (typeof value !== "string" || !ids.has(value)) { issue(code, path, `unknown reference: ${String(value)}`); return ""; }
  return value;
}
function references(value: unknown, ids: Set<string>, path: string, issue: IssueFn, requireNonEmpty: boolean): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) { issue("invalid_type", path, "references must be an array of strings"); return []; }
  if (requireNonEmpty && value.length === 0) issue("missing_provenance", path, "at least one reference is required");
  const seen = new Set<string>();
  for (const entry of value as string[]) { if (seen.has(entry)) issue("duplicate_id", path, `duplicate reference: ${entry}`); seen.add(entry); if (!ids.has(entry)) issue("broken_reference", path, `unknown reference: ${entry}`); }
  return value as string[];
}
function enumValue(value: unknown, allowed: Set<string>, path: string, issue: IssueFn): string {
  if (typeof value !== "string" || !allowed.has(value)) { issue("invalid_value", path, `unsupported value: ${String(value)}`); return ""; }
  return value;
}
function positiveInteger(value: unknown, path: string, issue: IssueFn, allowZero = false): void {
  if (!Number.isSafeInteger(value) || (value as number) < (allowZero ? 0 : 1)) issue("invalid_value", path, `value must be a ${allowZero ? "non-negative" : "positive"} safe integer`);
}
function numberTuple(value: unknown, path: string, issue: IssueFn, positive: boolean): void {
  if (!Array.isArray(value) || value.length !== 3 || value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry) || (positive && entry <= 0))) issue("invalid_value", path, `value must be a three-number tuple${positive ? " with positive values" : ""}`);
}
function stringRecord(value: unknown, path: string, issue: IssueFn): void {
  if (!isRecord(value) || Object.values(value).some((entry) => typeof entry !== "string" || entry.length === 0)) issue("invalid_type", path, "value must be an object of non-empty strings");
}
function validateTransform(value: unknown, path: string, issue: IssueFn): void {
  if (!isRecord(value)) return issue("invalid_type", path, "transform must be an object");
  if (value.position !== undefined) numberTuple(value.position, `${path}.position`, issue, false);
  if (value.rotation !== undefined) numberTuple(value.rotation, `${path}.rotation`, issue, false);
  if (value.scale !== undefined) numberTuple(value.scale, `${path}.scale`, issue, true);
}
function isoDate(value: unknown, path: string, issue: IssueFn): void {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) issue("invalid_value", path, "value must be an ISO-8601 UTC timestamp");
}
function httpUrl(value: unknown, path: string, issue: IssueFn): void {
  if (typeof value !== "string") return issue("invalid_type", path, "URL must be a string");
  try { const url = new URL(value); if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported protocol"); }
  catch { issue("invalid_value", path, "URL must use http or https"); }
}
function compositionError(message: string): DataExtensionValidationError {
  return new DataExtensionValidationError([{ code: "extension_conflict", path: "$", message }]);
}

type IssueFn = (code: ValidationCode, path: string, message: string) => void;
