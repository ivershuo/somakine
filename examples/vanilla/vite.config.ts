import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";

const dataPackPublicDir = fileURLToPath(new URL("../../data-packs/bodyparts3d-musculoskeletal/public", import.meta.url));
const examplePublicDir = fileURLToPath(new URL("./public", import.meta.url));

export default defineConfig({
  // Keep the data-pack manifest and GLBs available at their declared URIs.
  publicDir: dataPackPublicDir,
  // Vite accepts one publicDir; emit the example-owned assets alongside it.
  plugins: [emitExamplePublic()],
});

function emitExamplePublic(): Plugin {
  return {
    name: "somakine-example-public",
    apply: "build",
    async generateBundle() {
      for (const file of await collectFiles(examplePublicDir)) {
        this.emitFile({
          type: "asset",
          fileName: file.relativePath,
          source: await readFile(file.absolutePath),
        });
      }
    },
  };
}

interface PublicFile {
  absolutePath: string;
  relativePath: string;
}

async function collectFiles(directory: string, prefix = ""): Promise<PublicFile[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: PublicFile[] = [];
  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolutePath, relativePath));
    else if (entry.isFile()) files.push({ absolutePath, relativePath });
  }
  return files;
}
