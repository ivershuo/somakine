import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { createReadStream } from "node:fs";
import { copyFile, lstat, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { assertDataPack, SOMAKINE_SCHEMA_VERSION } from "../packages/core/dist/index.js";
import { assertSelfContainedGlb } from "../packages/viewer/dist/index.js";

const execFile = promisify(execFileCallback);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = await realpath(path.resolve(argument("--source")));
const destination = path.join(projectRoot, "data-packs/bodyparts3d-musculoskeletal");
const publicRoot = path.join(destination, "public");
const assetRoot = path.join(publicRoot, "assets/bodyparts3d");
const derivedRoot = path.join(sourceRoot, "data/derived/bodyparts3d/4.0");
const upstreamRoot = path.join(sourceRoot, "data/upstream/bodyparts3d/4.0/CC-BY-4.0");
const supplementalConfigPath = path.join(destination, "supplemental-coverage.json");
const ELEMENT_ID = /^FJ\d+M?$/u;
const SOURCE_TREES = new Set(["isa", "partof"]);
const STRUCTURE_TYPES = new Set(["joint", "ligament", "tendon"]);
const SOURCE_LATERALITIES = new Set(["paired", "midline", "variable", "none", "left", "right"]);
const LATERALITY_MIDLINE_EPSILON = 0.01;
const ZH_ORDINAL_DIGITS = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };

const [manifest, upstream, graph, english, chinese, supplemental] = await Promise.all([
  readJson(path.join(derivedRoot, "manifest.json")),
  readJson(path.join(upstreamRoot, "manifest.json")),
  readJson(path.join(sourceRoot, "data/anatomy/v1/graph.json")),
  readJson(path.join(sourceRoot, "data/anatomy/v1/content.en.json")),
  readJson(path.join(sourceRoot, "data/anatomy/v1/content.zh-CN.json")),
  readJson(supplementalConfigPath),
]);

assertManifestShape(manifest, upstream, supplemental);
await verifyUpstreamSnapshot(upstream);
installNodeFileReader();
const sourceInputs = await loadSourceTrees();
const supplementalEntries = resolveSupplementalEntries(supplemental, sourceInputs, graph);
const sourceAudit = auditSourceCoverage(sourceInputs, supplementalEntries);
await ensureSafeDirectory(destination, ["public", "assets", "bodyparts3d"]);
const destinationReal = await realpath(destination);

const assetRecords = flattenAssets(manifest.assets);
const assetByNode = indexAssetsByNode(assetRecords);
const glbNodeNames = new Map();
const regionCenters = new Map();
const assets = [];
for (const record of assetRecords) {
  const filename = path.basename(record.file);
  const sourceFile = path.join(derivedRoot, filename);
  const destinationFile = path.join(assetRoot, filename);
  await verifyFile(sourceFile, record.bytes, record.sha256);
  const bytes = await readFile(sourceFile);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  assertSelfContainedGlb(arrayBuffer);
  glbNodeNames.set(filename, glbNodes(arrayBuffer));
  if (record.role === "region") {
    const centers = await sideCentersOfGlb(arrayBuffer);
    if (centers) regionCenters.set(filename, centers);
  }
  await safeCopyFile(sourceFile, destinationFile);
  await verifyFile(destinationFile, record.bytes, record.sha256);
  assets.push({
    id: assetId(filename),
    kind: "gltf",
    uri: `assets/bodyparts3d/${filename}`,
    mediaType: "model/gltf-binary",
    sha256: record.sha256,
    bytes: record.bytes,
    geometry: { vertices: record.geometry.vertices, gpuBytes: record.geometry.gpuBytes },
    sourceIds: ["bodyparts3d-4"],
    licenseId: "CC-BY-4.0",
  });
}

const supplementalAssets = await exportSupplementalAssets(supplementalEntries, glbNodeNames);
for (const record of supplementalAssets.values()) {
  const bytes = await readFile(path.join(assetRoot, path.basename(record.file)));
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  assertSelfContainedGlb(arrayBuffer);
  glbNodeNames.set(path.basename(record.file), glbNodes(arrayBuffer));
  assets.push({
    id: assetId(path.basename(record.file)),
    kind: "gltf",
    uri: `assets/bodyparts3d/${path.basename(record.file)}`,
    mediaType: "model/gltf-binary",
    sha256: record.sha256,
    bytes: record.bytes,
    geometry: { vertices: record.geometry.vertices, gpuBytes: record.geometry.gpuBytes },
    sourceIds: ["bodyparts3d-4"],
    licenseId: "CC-BY-4.0",
  });
}

const graphNodes = new Map(graph.nodes.map((node) => [node.id, node]));
const grouped = groupCoverage(manifest.coverage);
const pairedBones = resolvePairedBones(grouped, assetByNode, glbNodeNames, regionCenters);
const structures = [];
const meshInstances = [];
const representations = [];

for (const [slug, entries] of [...grouped].sort(([a], [b]) => a.localeCompare(b))) {
  const first = entries[0];
  const id = structureId(slug);
  const types = new Set(entries.map((entry) => entry.type));
  const modes = new Set(entries.map((entry) => entry.mode));
  if (types.size !== 1 || modes.size !== 1) throw new Error(`Conflicting canonical structure ${slug}`);
  structures.push({
    id,
    type: first.type,
    laterality: pairedBones.has(slug) ? "paired" : "variable",
    regionIds: [...new Set(entries.map((entry) => regionId(entry.regionId)))].sort(),
    externalIds: externalIds(entries, graphNodes),
    sourceIds: ["bodyparts3d-4"],
    reviewState: "source-reviewed",
  });
}

for (const [slug, entries] of [...grouped].sort(([a], [b]) => a.localeCompare(b))) {
  const entry = entries[0];
  const structure = structureId(slug);
  const instanceIds = [];
  let contextStructureIds = [];
  const mode = entry.mode === "context" ? "unavailable" : entry.mode;
  if (mode === "direct") {
    const asset = exactAsset(assetByNode, entry.nodeId, entry.regionId, "region");
    const paired = pairedBones.get(slug);
    if (paired) {
      // Bilateral bone: emit one instance per side, selecting the per-side child
      // mesh node (<nodeId>:<tree>:FJ####) instead of the merged parent node.
      for (const side of ["left", "right"]) {
        const { elementId, selector } = paired[side];
        assertNode(glbNodeNames, asset, selector);
        const instanceId = `somakine:instance:${slug}-${elementId.toLowerCase()}`;
        meshInstances.push({
          id: instanceId,
          assetId: assetId(path.basename(asset.file)),
          laterality: side,
          selector: { kind: "node-name", value: selector },
        });
        instanceIds.push(instanceId);
      }
    } else {
      assertNode(glbNodeNames, asset, entry.nodeId);
      const instanceId = `somakine:instance:${slug}`;
      meshInstances.push({
        id: instanceId,
        assetId: assetId(path.basename(asset.file)),
        laterality: "none",
        selector: { kind: "node-name", value: entry.nodeId },
      });
      instanceIds.push(instanceId);
    }
  } else if (mode === "compound") {
    const asset = exactAsset(assetByNode, entry.nodeId, entry.regionId, "supplement");
    const elements = [...new Set(entry.meshSources.flatMap((source) => source.elementIds.map((elementId) => ({ tree: source.tree, elementId }))))];
    const uniqueElements = new Map(elements.map((element) => [`${element.tree}:${element.elementId}`, element]));
    for (const { tree, elementId } of uniqueElements.values()) {
      const selector = `${entry.nodeId}:${tree}:${elementId}`;
      assertNode(glbNodeNames, asset, selector);
      const instanceId = `somakine:instance:${slug}-${elementId.toLowerCase()}`;
      meshInstances.push({
        id: instanceId,
        assetId: assetId(path.basename(asset.file)),
        laterality: "none",
        selector: { kind: "node-name", value: selector },
      });
      instanceIds.push(instanceId);
    }
  } else if (mode !== "unavailable") {
    throw new Error(`Unsupported legacy coverage mode: ${entry.mode}`);
  }
  representations.push({
    id: `somakine:representation:${slug}`,
    structureId: structure,
    mode,
    instanceIds,
    contextStructureIds: [...new Set(contextStructureIds)],
    sourceIds: ["bodyparts3d-4"],
    reviewState: "source-reviewed",
  });
}

for (const entry of supplementalEntries) {
  const structure = structureId(entry.slug);
  const asset = supplementalAssets.get(entry.regionId);
  if (!asset) throw new Error(`${entry.slug}: missing generated supplemental asset`);
  const instanceIds = entry.elementIds.map((elementId) => {
    const tree = entry.source.tree;
    const nodeName = supplementalNodeName(entry.slug, tree, elementId);
    assertNode(glbNodeNames, asset, nodeName);
    const instanceId = `somakine:instance:${entry.slug}-${elementId.toLowerCase()}`;
    meshInstances.push({
      id: instanceId,
      assetId: assetId(path.basename(asset.file)),
      laterality: supplementalInstanceLaterality(entry.laterality, elementId),
      selector: { kind: "node-name", value: nodeName },
    });
    return instanceId;
  });
  structures.push({
    id: structure,
    type: entry.type,
    laterality: entry.structureLaterality,
    regionIds: [regionId(entry.regionId)],
    externalIds: {
      ...indexedIds("fma", new Set([entry.source.fmaId]), "bodyParts3D", new Set([entry.source.representationId])),
      bodyParts3DTree: entry.source.tree,
    },
    sourceIds: ["bodyparts3d-4"],
    reviewState: "source-reviewed",
  });
  representations.push({
    id: `somakine:representation:${entry.slug}`,
    structureId: structure,
    mode: "direct",
    instanceIds,
    contextStructureIds: [],
    sourceIds: ["bodyparts3d-4"],
    reviewState: "source-reviewed",
  });
}

const regions = graph.regions.map((region, index) => ({
  id: regionId(region.id),
  order: index + 1,
  sourceIds: ["bodyparts3d-4"],
}));
const pack = {
  schemaVersion: SOMAKINE_SCHEMA_VERSION,
  id: "somakine-bodyparts3d-musculoskeletal",
  version: "4.0.0-somakine.1",
  title: "Somakine BodyParts3D musculoskeletal pack",
  description: "Real BodyParts3D 4.0 geometry with source-native connective coverage and explicit unavailable states where no target representation exists.",
  createdAt: "2026-08-01T00:00:00Z",
  sources: [{
    id: "bodyparts3d-4",
    title: "BodyParts3D",
    version: "4.0",
    url: "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html",
    retrievedAt: `${upstream.source.retrieved}T00:00:00Z`,
  }],
  licenses: [{
    id: "CC-BY-4.0",
    name: "Creative Commons Attribution 4.0 International",
    url: "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html",
    attribution: manifest.source.attribution,
    redistribution: "attribution",
  }],
  regions,
  structures,
  relations: [],
  assets,
  meshInstances,
  representations,
  locales: [localePack("en", english), localePack("zh-CN", chinese)],
};

assertDataPack(pack);
assertCoverage(pack, manifest.coverage, supplementalEntries);
const supplementalLicense = [
  manifest.source.attribution,
  "",
  "Supplemental source-native joint, ligament, and tendon GLBs were generated",
  "from the verified BodyParts3D 4.0 IS-A and PART-OF OBJ archives.",
  "License: Creative Commons Attribution 4.0 International",
  "https://creativecommons.org/licenses/by/4.0/",
  "",
].join("\n");
await Promise.all([
  safeWriteFile(path.join(publicRoot, "pack.json"), `${JSON.stringify(pack, null, 2)}\n`),
  safeCopyFile(path.join(derivedRoot, "LICENSE.txt"), path.join(publicRoot, "LICENSE.bodyparts3d.txt")),
  safeCopyFile(path.join(derivedRoot, "manifest.json"), path.join(publicRoot, "source-manifest.json")),
  safeCopyFile(path.join(upstreamRoot, "manifest.json"), path.join(publicRoot, "upstream-manifest.json")),
  safeCopyFile(supplementalConfigPath, path.join(publicRoot, "supplemental-manifest.json")),
  safeWriteFile(path.join(publicRoot, "LICENSE.bodyparts3d-supplemental.txt"), supplementalLicense),
  writeGeneratedModule(pack),
]);

const report = {
  schemaVersion: 1,
  importedAt: "2026-08-01T00:00:00Z",
  sourceVersion: upstream.source.version,
  upstreamSnapshot: { files: upstream.completeSnapshot.fileCount, bytes: upstream.completeSnapshot.totalBytes },
  copiedAssets: assets.map(({ uri, bytes, sha256 }) => ({ uri, bytes, sha256 })),
  supplementalCoverage: {
    selected: supplementalEntries.map(({ slug, type, regionId: selectedRegion, laterality, source, sourceName, elementIds }) => ({
      slug,
      type,
      regionId: selectedRegion,
      laterality,
      source: { ...source, name: sourceName },
      elementIds,
    })),
    excluded: supplemental.excluded,
  },
  sourceAudit,
  unavailableLegacy: manifest.coverage
    .filter((entry) => entry.mode === "context")
    .map(({ nodeId, regionId: unavailableRegion, type }) => ({ nodeId, regionId: unavailableRegion, type })),
  coverage: coverageSummary(pack),
};
await safeWriteFile(path.join(publicRoot, "import-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Imported ${pack.structures.length} canonical structures and ${pack.assets.length} verified GLBs.`);

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) throw new Error("Usage: npm run import:bodyparts3d -- --source /absolute/path/to/source-workspace");
  return process.argv[index + 1];
}

async function readJson(file) {
  const info = await lstat(file);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error(`${file}: JSON source must be a regular file`);
  return JSON.parse(await readFile(file, "utf8"));
}

function assertManifestShape(derived, source, supplemental) {
  if (derived.schemaVersion !== 2 || derived.source?.id !== "bodyparts3d-4" || derived.source?.version !== "4.0") throw new Error("Unsupported derived BodyParts3D manifest");
  if (source.schemaVersion !== 1 || source.source?.id !== "bodyparts3d-4" || source.source?.version !== "4.0") throw new Error("Unsupported upstream BodyParts3D manifest");
  if (source.source.licenseId !== "CC-BY-4.0" || derived.source.licenseId !== "CC-BY-4.0") throw new Error("Unexpected BodyParts3D license");
  if (!Array.isArray(derived.coverage) || derived.coverage.length !== 152) throw new Error("Expected the reviewed 152-entry coverage manifest");
  if (supplemental.schemaVersion !== 1 || supplemental.sourceVersion !== "4.0" || !Array.isArray(supplemental.entries)) {
    throw new Error("Unsupported supplemental BodyParts3D coverage manifest");
  }
}

async function verifyUpstreamSnapshot(source) {
  const files = source.completeSnapshot.files;
  if (files.length !== source.completeSnapshot.fileCount) throw new Error("Upstream snapshot count mismatch");
  let bytes = 0;
  for (const file of files) {
    await verifyFile(path.join(upstreamRoot, "files", file.name), file.bytes, file.sha256);
    bytes += file.bytes;
  }
  if (bytes !== source.completeSnapshot.totalBytes) throw new Error("Upstream snapshot byte total mismatch");
}

async function loadSourceTrees() {
  const trees = {};
  for (const tree of SOURCE_TREES) {
    const archive = path.join(upstreamRoot, "files", `${tree}_BP3D_4.0_obj_99.zip`);
    const parts = await readFile(path.join(upstreamRoot, "files", `${tree}_parts_list_e.txt`), "utf8");
    const elements = await readFile(path.join(upstreamRoot, "files", `${tree}_element_parts.txt`), "utf8");
    trees[tree] = {
      archive,
      memberRoot: `${tree}_BP3D_4.0_obj_99`,
      parts: parsePartsTable(parts),
      elements: parseElementTable(elements),
    };
  }
  return trees;
}

function resolveSupplementalEntries(config, trees, sourceGraph) {
  const regionIds = new Set(sourceGraph.regions.map((region) => region.id));
  const seen = new Set();
  return config.entries.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("supplemental entry must be an object");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.slug) || seen.has(entry.slug)) {
      throw new Error(`invalid or duplicate supplemental slug: ${entry.slug}`);
    }
    seen.add(entry.slug);
    if (!STRUCTURE_TYPES.has(entry.type)) throw new Error(`${entry.slug}: unsupported supplemental type`);
    if (!regionIds.has(entry.regionId)) throw new Error(`${entry.slug}: unknown region ${entry.regionId}`);
    if (!SOURCE_LATERALITIES.has(entry.laterality)) throw new Error(`${entry.slug}: unsupported laterality`);
    if (!entry.label?.en || !entry.label?.["zh-CN"]) throw new Error(`${entry.slug}: bilingual labels are required`);
    const source = entry.source;
    if (!source || !SOURCE_TREES.has(source.tree)) throw new Error(`${entry.slug}: invalid source tree`);
    const tree = trees[source.tree];
    const part = tree.parts.get(source.fmaId);
    if (!part || part.representationId !== source.representationId) {
      throw new Error(`${entry.slug}: source representation does not match the official ${source.tree} table`);
    }
    const elementIds = tree.elements.get(source.fmaId);
    if (!elementIds?.length || elementIds.some((elementId) => !ELEMENT_ID.test(elementId))) {
      throw new Error(`${entry.slug}: source representation has no valid OBJ elements`);
    }
    return {
      slug: entry.slug,
      type: entry.type,
      regionId: entry.regionId,
      laterality: entry.laterality,
      structureLaterality: ["left", "right"].includes(entry.laterality) ? "none" : entry.laterality,
      label: entry.label,
      source: {
        tree: source.tree,
        fmaId: source.fmaId,
        representationId: source.representationId,
      },
      sourceName: part.name,
      elementIds: [...new Set(elementIds)],
    };
  });
}

function auditSourceCoverage(trees, selectedEntries) {
  const selected = new Set(selectedEntries.map((entry) => `${entry.source.tree}:${entry.source.fmaId}`));
  const candidates = [];
  for (const treeName of SOURCE_TREES) {
    const tree = trees[treeName];
    for (const [fmaId, part] of tree.parts) {
      const elementIds = tree.elements.get(fmaId);
      if (!elementIds?.length || !/\b(joint|ligament|tendon|symphysis|articular disk|discus)\b/iu.test(part.name)) continue;
      candidates.push({
        tree: treeName,
        fmaId,
        representationId: part.representationId,
        name: part.name,
        elementCount: elementIds.length,
        selected: selected.has(`${treeName}:${fmaId}`),
      });
    }
  }
  candidates.sort((a, b) => `${a.tree}:${a.fmaId}`.localeCompare(`${b.tree}:${b.fmaId}`));
  return {
    candidateRows: candidates.length,
    selectedRows: candidates.filter((candidate) => candidate.selected).length,
    excludedRows: candidates.filter((candidate) => !candidate.selected),
  };
}

async function exportSupplementalAssets(entries, nodeIndex) {
  const byRegion = new Map();
  for (const entry of entries) {
    const list = byRegion.get(entry.regionId) ?? [];
    list.push(entry);
    byRegion.set(entry.regionId, list);
  }
  const assetsByRegion = new Map();
  for (const region of [...byRegion.keys()].sort()) {
    const record = await exportSupplementalAsset(region, byRegion.get(region));
    const bytes = await readFile(path.join(assetRoot, path.basename(record.file)));
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    assertSelfContainedGlb(arrayBuffer);
    nodeIndex.set(path.basename(record.file), glbNodes(arrayBuffer));
    assetsByRegion.set(region, record);
  }
  return assetsByRegion;
}

async function exportSupplementalAsset(region, entries) {
  const scene = new THREE.Scene();
  scene.name = `bodyparts3d-supplement-${region}`;
  const root = new THREE.Group();
  root.name = "BodyParts3D";
  root.rotation.x = -Math.PI / 2;
  root.scale.setScalar(0.001);
  scene.add(root);
  const nodes = entries.map((entry) => ({
    nodeId: `supplemental:${entry.slug}`,
    regionId: entry.regionId,
    type: entry.type,
    mode: "direct",
    meshSources: [entry.source],
    elementSources: entry.elementIds.map((elementId) => ({ tree: entry.source.tree, elementId })),
  }));
  for (const node of nodes) root.add(await loadEntity(node));
  const geometry = geometryMetrics(root);
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true, trs: true });
  const fileName = `supplement-${region}-connective.glb`;
  const bytes = Buffer.from(glb);
  const target = path.join(assetRoot, fileName);
  await safeWriteFile(target, bytes);
  const info = {
    file: `/static/bodyparts3d/${fileName}`,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    geometry,
    entities: nodes.map(({ nodeId, regionId: entityRegion, type, mode, meshSources, elementSources }) => ({
      nodeId,
      regionId: entityRegion,
      type,
      mode,
      meshSources,
      elementIds: elementSources.map(({ elementId }) => elementId),
    })),
  };
  if (info.bytes > 5 * 1024 * 1024) throw new Error(`${fileName}: supplemental asset exceeds 5 MiB`);
  return info;
}

async function loadEntity(node) {
  const group = new THREE.Group();
  group.name = node.nodeId ?? `context:${node.type}`;
  group.userData = {
    ...(node.nodeId ? { entityId: node.nodeId } : {}),
    ...(node.regionId ? { regionId: node.regionId } : {}),
    type: node.type,
    mode: node.mode,
    source: "BodyParts3D 4.0",
    selectable: !node.context,
    context: Boolean(node.context),
  };
  for (const { tree, elementId } of node.elementSources) {
    const sourceBytes = await readArchiveObject(tree, elementId);
    const object = new OBJLoader().parse(sourceBytes.toString("utf8"));
    object.name = `${tree}:${elementId}`;
    object.traverse((child) => {
      if (!child.isMesh) return;
      child.name = `${group.name}:${tree}:${elementId}`;
      child.castShadow = false;
      child.receiveShadow = false;
      child.material = materialFor(node.type, node.context);
      const sourceGeometry = child.geometry;
      const nextGeometry = mergeVertices(sourceGeometry, 0.0001);
      sourceGeometry.dispose();
      child.geometry = nextGeometry;
      child.geometry.computeVertexNormals();
      child.geometry.computeBoundingSphere();
    });
    group.add(object);
  }
  return group;
}

async function readArchiveObject(treeName, elementId) {
  if (!SOURCE_TREES.has(treeName) || !ELEMENT_ID.test(elementId)) {
    throw new Error(`unsafe BodyParts3D archive member: ${treeName}/${elementId}`);
  }
  const tree = sourceInputs[treeName];
  const member = `${tree.memberRoot}/${elementId}.obj`;
  try {
    const { stdout } = await execFile("unzip", ["-p", tree.archive, member], {
      encoding: null,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (!Buffer.isBuffer(stdout) || stdout.length === 0) throw new Error("empty archive member");
    return stdout;
  } catch (error) {
    throw new Error(`${member}: unable to read verified archive object`, { cause: error });
  }
}

function materialFor(type, context = false) {
  if (context) {
    return new THREE.MeshStandardMaterial({
      color: 0xd7d3c9,
      roughness: 0.9,
      metalness: 0,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }
  const colors = {
    bone: 0xefd992,
    joint: 0xa8b2ad,
    ligament: 0x78aef2,
    muscle: 0xef6b62,
    tendon: 0xf0a24a,
  };
  return new THREE.MeshStandardMaterial({
    color: colors[type] ?? 0xa8b2ad,
    roughness: 0.72,
    metalness: 0,
    side: THREE.DoubleSide,
  });
}

function geometryMetrics(root) {
  const geometries = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
  });
  let vertices = 0;
  let triangles = 0;
  let gpuBytes = 0;
  for (const geometry of geometries) {
    const position = geometry.getAttribute("position");
    vertices += position?.count ?? 0;
    triangles += geometry.index ? geometry.index.count / 3 : (position?.count ?? 0) / 3;
    if (geometry.index) gpuBytes += geometry.index.array.byteLength;
    for (const attribute of Object.values(geometry.attributes)) gpuBytes += attribute.array.byteLength;
  }
  return { vertices, triangles: Math.floor(triangles), gpuBytes };
}

function parsePartsTable(text) {
  const result = new Map();
  for (const line of text.trim().split(/\r?\n/).slice(1)) {
    const [fmaId, representationId, name] = line.split("\t");
    if (fmaId && representationId) result.set(fmaId, { representationId, name });
  }
  return result;
}

function parseElementTable(text) {
  const result = new Map();
  for (const line of text.trim().split(/\r?\n/).slice(1)) {
    const [fmaId, , elementId] = line.split("\t");
    if (!fmaId || !elementId) continue;
    const ids = result.get(fmaId) ?? [];
    ids.push(elementId);
    result.set(fmaId, ids);
  }
  return result;
}

function flattenAssets(sourceAssets) {
  const output = [];
  for (const [region, asset] of Object.entries(sourceAssets.regions)) output.push({ ...asset, region, role: "region" });
  for (const [region, supplements] of Object.entries(sourceAssets.supplements)) {
    for (const asset of supplements) output.push({ ...asset, region, role: "supplement" });
  }
  if (output.length !== 12) throw new Error(`Expected 12 runtime GLBs, received ${output.length}`);
  return output.sort((a, b) => a.file.localeCompare(b.file));
}

function indexAssetsByNode(records) {
  const index = new Map();
  for (const record of records) for (const entity of record.entities) {
    const list = index.get(entity.nodeId) ?? [];
    list.push(record);
    index.set(entity.nodeId, list);
  }
  return index;
}

function exactAsset(index, nodeId, region, role) {
  const matches = (index.get(nodeId) ?? []).filter((asset) => asset.region === region && asset.role === role);
  if (matches.length !== 1) throw new Error(`Expected one ${role} asset for ${nodeId}, received ${matches.length}`);
  return matches[0];
}

function glbNodes(bytes) {
  const view = new DataView(bytes);
  const jsonLength = view.getUint32(12, true);
  const document = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength)).trim());
  return new Set((document.nodes ?? []).map((node) => node.name).filter(Boolean));
}

// Load a region GLB and map every named node to the x-center of its bounding
// box (scene space). Used to read the left/right side of a bone's per-side
// child mesh when splitting bilateral bones.
async function sideCentersOfGlb(arrayBuffer) {
  let gltf;
  try {
    gltf = await new GLTFLoader().parseAsync(arrayBuffer, "");
  } catch {
    return null;
  }
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const centers = new Map();
  scene.traverse((object) => {
    if (!object.name) return;
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    centers.set(object.name, (box.min.x + box.max.x) / 2);
  });
  return centers;
}

// Bones are bilateral in BodyParts3D: each canonical bone node carries two
// per-side child meshes (<nodeId>:<tree>:FJ####). The source ontology files both
// elements under one bilateral FMA id, so side is read from geometry instead.
// Ground truth (supplemental calcaneal-tendon, M-suffix=left) establishes that
// in the pack's scene space the subject's LEFT side is at +x and RIGHT at -x.
function resolvePairedBones(grouped, assetByNode, glbNodeNames, regionCenters) {
  const paired = new Map();
  for (const [slug, entries] of grouped) {
    const entry = entries[0];
    if (entry.mode !== "direct") continue;
    const meshSource = entry.meshSources?.[0];
    const elementIds = [...new Set(meshSource?.elementIds ?? [])];
    if (!meshSource || elementIds.length !== 2) continue;
    const asset = exactAsset(assetByNode, entry.nodeId, entry.regionId, "region");
    const filename = path.basename(asset.file);
    const centers = regionCenters.get(filename);
    if (!centers) continue;
    const sides = [];
    for (const elementId of elementIds) {
      const selector = `${entry.nodeId}:${meshSource.tree}:${elementId}`;
      if (!glbNodeNames.get(filename)?.has(selector)) { sides.length = 0; break; }
      const cx = centers.get(THREE.PropertyBinding.sanitizeNodeName(selector));
      if (cx === undefined) { sides.length = 0; break; }
      sides.push({ elementId, selector, cx });
    }
    if (sides.length !== 2) continue;
    const positive = sides.find((side) => side.cx > LATERALITY_MIDLINE_EPSILON);
    const negative = sides.find((side) => side.cx < -LATERALITY_MIDLINE_EPSILON);
    if (!positive || !negative) continue; // midline or not cleanly bilateral
    paired.set(slug, {
      left: { elementId: positive.elementId, selector: positive.selector },
      right: { elementId: negative.elementId, selector: negative.selector },
    });
  }
  return paired;
}

function assertNode(nodeIndex, asset, nodeName) {
  const filename = path.basename(asset.file);
  if (!nodeIndex.get(filename)?.has(nodeName)) throw new Error(`${filename} is missing node ${nodeName}`);
}

function groupCoverage(coverage) {
  const groups = new Map();
  for (const entry of coverage) {
    const slug = entry.nodeId.split(":").at(-1);
    const values = groups.get(slug) ?? [];
    values.push(entry);
    groups.set(slug, values);
  }
  if (groups.size !== 150) throw new Error(`Expected 150 canonical structures, received ${groups.size}`);
  return groups;
}

function externalIds(entries, nodes) {
  const fma = new Set();
  const bodyParts3D = new Set();
  for (const entry of entries) {
    const graphIds = nodes.get(entry.nodeId)?.externalIds ?? {};
    if (graphIds.fma) fma.add(graphIds.fma);
    if (graphIds.bodyParts3D) bodyParts3D.add(graphIds.bodyParts3D);
    for (const source of entry.meshSources ?? []) {
      if (source.fmaId) fma.add(source.fmaId);
      if (source.representationId) bodyParts3D.add(source.representationId);
    }
  }
  return indexedIds("fma", fma, "bodyParts3D", bodyParts3D);
}

function indexedIds(firstKey, firstValues, secondKey, secondValues) {
  const output = {};
  for (const [key, values] of [[firstKey, [...firstValues].sort()], [secondKey, [...secondValues].sort()]]) {
    values.forEach((value, index) => { output[index === 0 ? key : `${key}:${index + 1}`] = value; });
  }
  return output;
}

function localePack(locale, content) {
  const labels = {};
  const aliases = {};
  const normalize = locale === "zh-CN" ? normalizeZhLabel : (label) => label;
  for (const region of content.regions ? Object.entries(content.regions) : []) {
    const [id, value] = region;
    labels[regionId(id)] = normalize(value.name);
    if (value.aliases?.length) aliases[regionId(id)] = value.aliases;
  }
  for (const [slug, entries] of grouped) {
    const localized = content.nodes[entries[0].nodeId];
    if (!localized?.name) throw new Error(`Missing ${locale} label for ${entries[0].nodeId}`);
    labels[structureId(slug)] = normalize(localized.name);
    if (localized.aliases?.length) aliases[structureId(slug)] = localized.aliases;
  }
  for (const entry of supplementalEntries) {
    const label = entry.label[locale];
    if (!label) throw new Error(`Missing ${locale} supplemental label for ${entry.slug}`);
    labels[structureId(entry.slug)] = normalize(label);
  }
  return { locale, labels, aliases };
}

// Display convention: render the Chinese ordinal numeral in a 第N prefix as
// Arabic (第二 → 第2, 第十一 → 第11) so generated labels stay consistent
// regardless of the source's numeral style.
function normalizeZhLabel(label) {
  return label.replace(/第([一二三四五六七八九十]+)/gu, (match, numeral) => {
    const value = zhOrdinalToArabic(numeral);
    return value === null ? match : `第${value}`;
  });
}

function zhOrdinalToArabic(numeral) {
  if (!/^[一二三四五六七八九十]+$/u.test(numeral)) return null;
  if (numeral === "十") return 10;
  if (numeral.startsWith("十")) return 10 + (ZH_ORDINAL_DIGITS[numeral.slice(1)] ?? 0);
  if (numeral.endsWith("十")) return (ZH_ORDINAL_DIGITS[numeral.slice(0, -1)] ?? 1) * 10;
  if (numeral.includes("十")) {
    const [tens, ones] = numeral.split("十");
    return (ZH_ORDINAL_DIGITS[tens] ?? 1) * 10 + (ZH_ORDINAL_DIGITS[ones] ?? 0);
  }
  return ZH_ORDINAL_DIGITS[numeral] ?? null;
}

function assertCoverage(packValue, regionalCoverage, selectedEntries) {
  const counts = coverageSummary(packValue);
  if (counts.direct !== 151 || counts.compound !== 4 || counts.context !== 0 || counts.unavailable !== 25) {
    throw new Error(`Unexpected canonical coverage: ${JSON.stringify(counts)}`);
  }
  if (selectedEntries.length !== 30) throw new Error(`Unexpected supplemental entry count: ${selectedEntries.length}`);
  const regional = Object.fromEntries(["direct", "compound", "context"].map((mode) => [mode, regionalCoverage.filter((entry) => entry.mode === mode).length]));
  if (regional.direct !== 123 || regional.compound !== 4 || regional.context !== 25) throw new Error(`Unexpected regional coverage: ${JSON.stringify(regional)}`);
  for (const slug of ["humerus", "femur"]) {
    const structure = packValue.structures.find((entry) => entry.id === structureId(slug));
    if (structure?.regionIds.length !== 2) throw new Error(`${slug} must be one canonical structure in two regions`);
  }
}

function coverageSummary(packValue) {
  return packValue.representations.reduce((summary, representation) => {
    summary[representation.mode] += 1;
    return summary;
  }, { direct: 0, compound: 0, context: 0, unavailable: 0 });
}

async function writeGeneratedModule(packValue) {
  const stats = { regions: packValue.regions.length, structures: packValue.structures.length, assets: packValue.assets.length, coverage: coverageSummary(packValue) };
  const source = `// Generated by tools/import-bodyparts3d.mjs. Do not edit by hand.\nimport type { DataPack } from "@somakine/core";\n\nexport const bodyParts3DMusculoskeletal: DataPack = ${JSON.stringify(packValue, null, 2)};\n\nexport const bodyParts3DMusculoskeletalStats = ${JSON.stringify(stats, null, 2)} as const;\n`;
  await safeWriteFile(path.join(destination, "src/generated.ts"), source);
}

async function verifyFile(file, expectedBytes, expectedSha256) {
  const linkInfo = await lstat(file);
  if (linkInfo.isSymbolicLink()) throw new Error(`${file}: symbolic links are not accepted`);
  const info = await stat(file);
  if (!info.isFile() || info.size !== expectedBytes) throw new Error(`${file}: expected ${expectedBytes} bytes, received ${info.size}`);
  const digest = await hashFile(file);
  if (digest !== expectedSha256) throw new Error(`${file}: SHA-256 mismatch`);
}

async function safeCopyFile(source, target) {
  const sourceInfo = await lstat(source);
  if (sourceInfo.isSymbolicLink() || !sourceInfo.isFile()) throw new Error(`${source}: copy source must be a regular file`);
  await assertSafeTarget(target);
  await copyFile(source, target);
}

async function safeWriteFile(target, contents) {
  await assertSafeTarget(target);
  await writeFile(target, contents);
}

async function assertSafeTarget(target) {
  const relativeTarget = path.relative(destination, target);
  if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) throw new Error(`copy target escapes the data pack: ${target}`);
  const parentReal = await realpath(path.dirname(target));
  if (parentReal !== destinationReal && !parentReal.startsWith(`${destinationReal}${path.sep}`)) {
    throw new Error(`${target}: parent directory escapes the data pack`);
  }
  try {
    const targetInfo = await lstat(target);
    if (targetInfo.isSymbolicLink() || !targetInfo.isFile()) throw new Error(`${target}: copy target must be a regular file`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function ensureSafeDirectory(root, segments) {
  let current = root;
  const rootInfo = await lstat(root);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error(`${root}: destination root must be a regular directory`);
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`${current}: destination path must be a regular directory`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await mkdir(current);
    }
  }
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function supplementalNodeName(slug, tree, elementId) {
  return `supplemental:${slug}:${tree}:${elementId}`;
}

function supplementalInstanceLaterality(entryLaterality, elementId) {
  if (entryLaterality === "paired") return elementId.endsWith("M") ? "left" : "right";
  if (entryLaterality === "left" || entryLaterality === "right") return entryLaterality;
  return "none";
}

function assetId(filename) { return `somakine:asset:bodyparts3d-4:${filename.replace(/\.glb$/u, "")}`; }
function structureId(slug) { return `somakine:structure:${slug}`; }
function regionId(slug) { return `somakine:region:${slug}`; }

function installNodeFileReader() {
  if (globalThis.FileReader) return;
  globalThis.FileReader = class NodeFileReader {
    result = null;
    onloadend = null;
    onerror = null;

    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(
        (result) => {
          this.result = result;
          this.onloadend?.();
        },
        (error) => this.onerror?.(error),
      );
    }

    readAsDataURL(blob) {
      blob.arrayBuffer().then(
        (result) => {
          this.result = `data:${blob.type};base64,${Buffer.from(result).toString("base64")}`;
          this.onloadend?.();
        },
        (error) => this.onerror?.(error),
      );
    }
  };
}
