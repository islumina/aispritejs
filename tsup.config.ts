import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "pixi/index": "src/pixi/index.ts",
    "atlas/index": "src/atlas/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  // splitting must stay ON so tsup hoists the shared core (compile/machine/
  // inputs plus the error classes — InvalidGraphError, MissingFrameError, …)
  // into chunk-*.js files imported by every entry. With splitting:false each
  // entry inlines its OWN copy, so an InvalidGraphError thrown inside
  // `aispritejs/atlas` (loadAtlas bundles the compiler) is a DIFFERENT class
  // object than the root export: `err instanceof InvalidGraphError` returns
  // false across the subpath boundary. scripts/check-dist-subpaths.mjs asserts
  // this same-realm identity; mirrors aiecsjs/aifsmjs/aibridgejs tsup configs.
  splitting: true,
  target: "es2022",
  outDir: "dist",
  // pixi.js is an optional peer; the adapter imports it type-only, so nothing
  // pixi-related should reach the bundle. Marked external as belt-and-braces.
  external: ["pixi.js"],
});
