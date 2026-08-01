import { rm } from "node:fs/promises";
import { glob } from "node:fs/promises";

for await (const entry of glob(["packages/*/dist", "data-packs/*/dist", "examples/*/dist", "examples/*/dist-types", "**/*.tsbuildinfo"])) {
  await rm(entry, { recursive: true, force: true });
}
