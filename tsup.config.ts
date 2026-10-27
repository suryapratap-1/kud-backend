import { defineConfig } from "tsup";

// Bundles our own code (resolving "@/" paths) into dist/; dependencies stay in node_modules.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  sourcemap: true,
  clean: true,
});
