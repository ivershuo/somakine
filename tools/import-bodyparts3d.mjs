import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, lstat, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertDataPack, SOMAKINE_SCHEMA_VERSION } from "../packages/core/dist/index.js";
import { assertSelfContainedGlb } from "../packages/viewer/dist/index.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = await realpath(path.resolve(argument("--source")));
const destination = path.join(projectRoot, "data-packs/bodyparts3d-musculoskeletal");
const publicRoot = path.join(destination, "public");
const assetRoot = path.join(publicRoot, "assets/bodyparts3d");
const derivedRoot = path.join(sourceRoot, "data/derived/bodyparts3d/4.0");
const upstreamRoot = path.join(sourceRoot, "data/upstream/bodyparts3d/4.0/CC-BY-4.0");

const [manifest, upstream, graph, english, chinese] = await Promise.all([
  readJson(path.join(derivedRoot, "manifest.json")),
  readJson(path.join(upstreamRoot, "manifest.json")),
  readJson(path.join(sourceRoot, "data/anatomy/v1/graph.json")),
  readJson(path.join(sourceRoot, "data/anatomy/v1/content.en.json")),
  readJson(path.join(sourceRoot, "data/anatomy/v1/content.zh-CN.json")),
]);

assertManifestShape(manifest, upstream);
await verifyUpstreamSnapshot(upstream);
await ensureSafeDirectory(destination, ["public", "assets", "bodyparts3d"]);
const destinationReal = await realpath(destination);

const assetRecords = flattenAssets(manifest.assets);
const assetByNode = indexAssetsByNode(assetRecords);
const glbNodeNames = new Map();
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

const graphNodes = new Map(graph.nodes.map((node) => [node.id, node]));
const grouped = groupCoverage(manifest.coverage);
const structures = [];
const meshInstances = [];
const representations = [];
const canonicalByOldId = new Map();

for (const [slug, entries] of [...grouped].sort(([a], [b]) => a.localeCompare(b))) {
  const first = entries[0];
  const id = structureId(slug);
  for (const entry of entries) canonicalByOldId.set(entry.nodeId, id);
  const types = new Set(entries.map((entry) => entry.type));
  const modes = new Set(entries.map((entry) => entry.mode));
  if (types.size !== 1 || modes.size !== 1) throw new Error(`Conflicting canonical structure ${slug}`);
  structures.push({
    id,
    type: first.type,
    laterality: "variable",
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
  if (entry.mode === "direct") {
    const asset = exactAsset(assetByNode, entry.nodeId, entry.regionId, "region");
    assertNode(glbNodeNames, asset, entry.nodeId);
    const instanceId = `somakine:instance:${slug}`;
    meshInstances.push({
      id: instanceId,
      assetId: assetId(path.basename(asset.file)),
      laterality: "none",
      selector: { kind: "node-name", value: entry.nodeId },
    });
    instanceIds.push(instanceId);
  } else if (entry.mode === "compound") {
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
  } else if (entry.mode === "context") {
    contextStructureIds = entry.contextNodeIds.map((oldId) => canonicalByOldId.get(oldId) ?? structureId(oldId.split(":").at(-1)));
  } else {
    throw new Error(`Unsupported legacy coverage mode: ${entry.mode}`);
  }
  representations.push({
    id: `somakine:representation:${slug}`,
    structureId: structure,
    mode: entry.mode,
    instanceIds,
    contextStructureIds: [...new Set(contextStructureIds)],
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
  version: "4.0.0-somakine.0",
  title: "Somakine BodyParts3D musculoskeletal pack",
  description: "Real BodyParts3D 4.0 geometry with honest direct, compound, and contextual coverage; terminology review pending.",
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
assertCoverage(pack, manifest.coverage);
await Promise.all([
  safeWriteFile(path.join(publicRoot, "pack.json"), `${JSON.stringify(pack, null, 2)}\n`),
  safeCopyFile(path.join(derivedRoot, "LICENSE.txt"), path.join(publicRoot, "LICENSE.bodyparts3d.txt")),
  safeCopyFile(path.join(derivedRoot, "manifest.json"), path.join(publicRoot, "source-manifest.json")),
  safeCopyFile(path.join(upstreamRoot, "manifest.json"), path.join(publicRoot, "upstream-manifest.json")),
  writeGeneratedModule(pack),
]);

const report = {
  schemaVersion: 1,
  importedAt: "2026-08-01T00:00:00Z",
  sourceVersion: upstream.source.version,
  upstreamSnapshot: { files: upstream.completeSnapshot.fileCount, bytes: upstream.completeSnapshot.totalBytes },
  copiedAssets: assets.map(({ uri, bytes, sha256 }) => ({ uri, bytes, sha256 })),
  coverage: coverageSummary(pack),
};
await safeWriteFile(path.join(publicRoot, "import-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Imported ${pack.structures.length} canonical structures and ${pack.assets.length} verified GLBs.`);

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) throw new Error(`Usage: npm run import:bodyparts3d -- --source /absolute/path/to/kinexis`);
  return process.argv[index + 1];
}

async function readJson(file) {
  const info = await lstat(file);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error(`${file}: JSON source must be a regular file`);
  return JSON.parse(await readFile(file, "utf8"));
}

function assertManifestShape(derived, source) {
  if (derived.schemaVersion !== 2 || derived.source?.id !== "bodyparts3d-4" || derived.source?.version !== "4.0") throw new Error("Unsupported derived BodyParts3D manifest");
  if (source.schemaVersion !== 1 || source.source?.id !== "bodyparts3d-4" || source.source?.version !== "4.0") throw new Error("Unsupported upstream BodyParts3D manifest");
  if (source.source.licenseId !== "CC-BY-4.0" || derived.source.licenseId !== "CC-BY-4.0") throw new Error("Unexpected BodyParts3D license");
  if (!Array.isArray(derived.coverage) || derived.coverage.length !== 152) throw new Error("Expected the reviewed 152-entry coverage manifest");
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
  for (const region of content.regions ? Object.entries(content.regions) : []) {
    const [id, value] = region;
    labels[regionId(id)] = value.name;
    if (value.aliases?.length) aliases[regionId(id)] = value.aliases;
  }
  for (const [slug, entries] of grouped) {
    const localized = content.nodes[entries[0].nodeId];
    if (!localized?.name) throw new Error(`Missing ${locale} label for ${entries[0].nodeId}`);
    labels[structureId(slug)] = localized.name;
    if (localized.aliases?.length) aliases[structureId(slug)] = localized.aliases;
  }
  return { locale, labels, aliases };
}

function assertCoverage(packValue, regionalCoverage) {
  const counts = coverageSummary(packValue);
  if (counts.direct !== 121 || counts.compound !== 4 || counts.context !== 25 || counts.unavailable !== 0) {
    throw new Error(`Unexpected canonical coverage: ${JSON.stringify(counts)}`);
  }
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

function assetId(filename) { return `somakine:asset:bodyparts3d-4:${filename.replace(/\.glb$/u, "")}`; }
function structureId(slug) { return `somakine:structure:${slug}`; }
function regionId(slug) { return `somakine:region:${slug}`; }
