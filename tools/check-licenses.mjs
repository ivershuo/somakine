import { access, readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";

await Promise.all([access("LICENSE"), access("NOTICE"), access("SECURITY.md")]);
const failures = [];
for await (const file of glob("{packages,data-packs}/*/package.json")) {
  const manifest = JSON.parse(await readFile(file, "utf8"));
  const expected = manifest.name === "@somakine/bodyparts3d-musculoskeletal" ? "CC-BY-4.0" : "Apache-2.0";
  if (manifest.license !== expected) failures.push(`${file}: expected ${expected}`);
}
const adapter = await readFile("packages/bodyparts3d/src/index.ts", "utf8");
for (const token of ["CC-BY-4.0", "CC Attribution 4.0", "BodyParts3D"]) {
  if (!adapter.includes(token)) failures.push(`BodyParts3D attribution is missing ${token}`);
}
const realPack = await readFile("data-packs/bodyparts3d-musculoskeletal/public/pack.json", "utf8");
for (const token of ["CC-BY-4.0", "BodyParts3D", "Database Center for Life Science"]) {
  if (!realPack.includes(token)) failures.push(`real BodyParts3D pack is missing ${token}`);
}
await Promise.all([
  access("data-packs/bodyparts3d-musculoskeletal/public/LICENSE.bodyparts3d.txt"),
  access("data-packs/bodyparts3d-musculoskeletal/public/upstream-manifest.json"),
  access("data-packs/bodyparts3d-musculoskeletal/public/source-manifest.json"),
]);
if (failures.length) throw new Error(failures.join("\n"));
console.log("license and attribution check passed");
