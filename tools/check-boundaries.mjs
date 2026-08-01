import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";

const forbidden = [
  { label: "Three.js import", pattern: /from\s+["']three(?:\/[^"']*)?["']/ },
  { label: "Node.js import", pattern: /from\s+["']node:/ },
  { label: "window global", pattern: /\bwindow\s*\./ },
  { label: "document global", pattern: /\bdocument\s*\./ },
  { label: "DOM type", pattern: /\b(?:HTMLElement|WebGLRenderingContext)\b/ },
];
const files = [];
for await (const file of glob("packages/core/src/**/*.ts")) files.push(file);

const failures = [];
for (const file of files) {
  const source = await readFile(file, "utf8");
  for (const rule of forbidden) if (rule.pattern.test(source)) failures.push(`${file}: forbidden core dependency ${rule.label}`);
}
if (failures.length) throw new Error(failures.join("\n"));
console.log(`boundary check passed (${files.length} core files)`);
