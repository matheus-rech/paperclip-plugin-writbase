import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts", "src/manifest.ts"],
    format: ["esm"],
    outDir: "dist",
    clean: true,
    dts: true,
    target: "node20",
    sourcemap: true,
    splitting: true,
  },
  {
    entry: ["src/worker.ts"],
    format: ["esm"],
    outDir: "dist",
    dts: false,
    target: "node20",
    sourcemap: true,
    splitting: false,
  },
]);
