import { stat } from "node:fs/promises";

const budgets = new Map([
  ["packages/core/dist/index.js", 40_000],
  ["packages/viewer/dist/index.js", 80_000],
  ["data-packs/musculoskeletal-basic/dist/index.js", 100_000]
]);
const failures = [];
for (const [file, maximum] of budgets) {
  const { size } = await stat(file);
  if (size > maximum) failures.push(`${file}: ${size} bytes exceeds ${maximum}`);
}
if (failures.length) throw new Error(failures.join("\n"));
console.log("distribution size budgets passed");
