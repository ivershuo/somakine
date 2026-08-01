import { readdir, stat } from "node:fs/promises";

const budgets = new Map([
  ["packages/core/dist/index.js", 40_000],
  ["packages/viewer/dist/index.js", 80_000],
  ["data-packs/musculoskeletal-basic/dist/index.js", 100_000],
  ["data-packs/bodyparts3d-musculoskeletal/dist/generated.js", 300_000],
  ["data-packs/bodyparts3d-musculoskeletal/public/pack.json", 250_000]
]);
const failures = [];
for (const [file, maximum] of budgets) {
  const { size } = await stat(file);
  if (size > maximum) failures.push(`${file}: ${size} bytes exceeds ${maximum}`);
}
if (failures.length) throw new Error(failures.join("\n"));
const assetDirectory = "data-packs/bodyparts3d-musculoskeletal/public/assets/bodyparts3d";
const assetFiles = (await readdir(assetDirectory)).filter((file) => file.endsWith(".glb"));
const assetBytes = (await Promise.all(assetFiles.map((file) => stat(`${assetDirectory}/${file}`)))).reduce((total, info) => total + info.size, 0);
if (assetFiles.length !== 12) failures.push(`expected 12 BodyParts3D GLBs, received ${assetFiles.length}`);
if (assetBytes > 14_000_000) failures.push(`BodyParts3D runtime assets exceed 14 MB: ${assetBytes}`);
if (failures.length) throw new Error(failures.join("\n"));
console.log("distribution size budgets passed");
