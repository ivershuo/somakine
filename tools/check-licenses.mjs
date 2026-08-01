import { access, readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";

await Promise.all([access("LICENSE"), access("NOTICE"), access("SECURITY.md")]);
const failures = [];
for await (const file of glob("{packages,data-packs}/*/package.json")) {
  const manifest = JSON.parse(await readFile(file, "utf8"));
  if (manifest.license !== "Apache-2.0") failures.push(`${file}: expected Apache-2.0`);
}
const adapter = await readFile("packages/bodyparts3d/src/index.ts", "utf8");
for (const token of ["CC-BY-4.0", "CC Attribution 4.0", "BodyParts3D"]) {
  if (!adapter.includes(token)) failures.push(`BodyParts3D attribution is missing ${token}`);
}
if (failures.length) throw new Error(failures.join("\n"));
console.log("license and attribution check passed");
