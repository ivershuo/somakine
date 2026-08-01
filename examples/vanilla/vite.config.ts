import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: fileURLToPath(new URL("../../data-packs/bodyparts3d-musculoskeletal/public", import.meta.url)),
});
