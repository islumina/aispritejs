#!/usr/bin/env node
// Regression guard: verify that dist ESM + CJS subpaths are loadable and that
// cross-subpath usage works correctly.
//
// aispritejs-specific contract:
//   1. /atlas parseAtlas output feeds root compileGraph → machine runs a transition.
//   2. /pixi is type-only peer — runtime import must succeed even without pixi.js
//      installed (no runtime pixi.js require in the built output).
//   3. ./schema (JSON subpath) loads via createRequire and exposes $id + known keys.
//
// Run after `pnpm build`; fails the publish if anything is broken.

import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Minimal graph used for cross-subpath integration smoke
// ---------------------------------------------------------------------------
const minimalAtlas = {
  animations: { idle: ["idle_0"], walk: ["walk_0"] },
  inputs: { speed: { type: "number", default: 0 } },
  states: {
    idle: { animation: "idle", loop: true },
    walk: { animation: "walk", loop: true },
  },
  transitions: [
    { from: "idle", to: "walk", when: [{ input: "speed", op: "GreaterThan", value: 0 }] },
  ],
  initial: "idle",
};

// ---------------------------------------------------------------------------
// ESM smoke
// ---------------------------------------------------------------------------
async function smokeESM() {
  // Root subpath — public API only (compileGraph is internal)
  const { createSpriteAnimator, InvalidGraphError } = await import(resolve(root, "dist/index.js"));

  // /atlas subpath — parseAtlas output feeds root createSpriteAnimator
  const { parseAtlas, loadAtlas } = await import(resolve(root, "dist/atlas/index.js"));

  const graph = parseAtlas(minimalAtlas);
  if (!graph.animations || !graph.inputs || !graph.states || !graph.transitions) {
    throw new Error("ESM: parseAtlas did not return a valid SpriteGraph");
  }

  // Cross-subpath CLASS IDENTITY: /atlas's loadAtlas bundles the compile core,
  // so the InvalidGraphError it throws must be the SAME class object the root
  // entry exports — otherwise `err instanceof InvalidGraphError` (root import)
  // is false across the subpath boundary. Requires tsup `splitting: true`
  // (shared chunks); with `splitting: false` each entry inlines its own copy.
  let identityErr;
  try {
    loadAtlas({
      animations: { idle: ["idle_0"] },
      inputs: { speed: { type: "number", default: "5" } },
      states: { idle: { animation: "idle", loop: true } },
      transitions: [],
      initial: "idle",
    });
    throw new Error("ESM: expected loadAtlas to reject a mistyped input default");
  } catch (err) {
    identityErr = err;
  }
  if (!(identityErr instanceof InvalidGraphError)) {
    throw new Error(
      `ESM: InvalidGraphError thrown via /atlas is not the root class (got ${identityErr?.constructor?.name}) — cross-subpath identity broken (tsup splitting)`,
    );
  }

  // Full pipeline: loadAtlas → animator → run a transition
  const anim = loadAtlas(minimalAtlas);
  anim.setInput("speed", 5);
  anim.update(0);
  if (anim.activeState !== "walk") {
    throw new Error(`ESM: expected state "walk", got "${anim.activeState}"`);
  }

  // Cross-subpath identity: createSpriteAnimator (root) receives /atlas parseAtlas output
  const anim2 = createSpriteAnimator(graph);
  anim2.setInput("speed", 3);
  anim2.update(0);
  if (anim2.activeState !== "walk") {
    throw new Error(`ESM: root createSpriteAnimator cross-subpath failed, state="${anim2.activeState}"`);
  }

  // /pixi subpath — type-only peer; must import without requiring pixi.js at runtime
  const pixiSubpath = await import(resolve(root, "dist/pixi/index.js"));
  if (typeof pixiSubpath.createPixiSpriteAnimator !== "function") {
    throw new Error("ESM: /pixi createPixiSpriteAnimator is not a function");
  }
  if (typeof pixiSubpath.MissingTextureError !== "function") {
    throw new Error("ESM: /pixi MissingTextureError is not exported");
  }
  // Confirm no runtime pixi.js require leaked: calling the export without a
  // real Sprite should throw our own graph/argument error, not a pixi.js
  // module-not-found error.
  try {
    pixiSubpath.createPixiSpriteAnimator(null, graph, {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Cannot find module") && msg.includes("pixi.js")) {
      throw new Error(`ESM: /pixi leaked a runtime pixi.js require: ${msg}`);
    }
    // Any other error (e.g. null-dereference on the fake sprite) is fine —
    // it proves the module loaded without needing pixi.js at runtime.
  }

  process.stdout.write("ESM: CROSS-SUBPATH-OK\n");
}

// ---------------------------------------------------------------------------
// CJS smoke
// ---------------------------------------------------------------------------
function smokeCJS() {
  const { createSpriteAnimator, InvalidGraphError } = require(resolve(root, "dist/index.cjs"));
  const { parseAtlas, loadAtlas } = require(resolve(root, "dist/atlas/index.cjs"));

  const graph = parseAtlas(minimalAtlas);
  if (!graph.animations || !graph.inputs) {
    throw new Error("CJS: parseAtlas did not return a valid SpriteGraph");
  }

  // Cross-subpath CLASS IDENTITY — same contract as the ESM block above.
  let identityErr;
  try {
    loadAtlas({
      animations: { idle: ["idle_0"] },
      inputs: { speed: { type: "number", default: "5" } },
      states: { idle: { animation: "idle", loop: true } },
      transitions: [],
      initial: "idle",
    });
    throw new Error("CJS: expected loadAtlas to reject a mistyped input default");
  } catch (err) {
    identityErr = err;
  }
  if (!(identityErr instanceof InvalidGraphError)) {
    throw new Error(
      `CJS: InvalidGraphError thrown via /atlas is not the root class (got ${identityErr?.constructor?.name}) — cross-subpath identity broken (tsup splitting)`,
    );
  }

  const anim = loadAtlas(minimalAtlas);
  anim.setInput("speed", 5);
  anim.update(0);
  if (anim.activeState !== "walk") {
    throw new Error(`CJS: expected state "walk", got "${anim.activeState}"`);
  }

  const anim2 = createSpriteAnimator(graph);
  anim2.setInput("speed", 3);
  anim2.update(0);
  if (anim2.activeState !== "walk") {
    throw new Error(`CJS: root createSpriteAnimator cross-subpath failed, state="${anim2.activeState}"`);
  }

  // /pixi CJS
  const pixiCJS = require(resolve(root, "dist/pixi/index.cjs"));
  if (typeof pixiCJS.createPixiSpriteAnimator !== "function") {
    throw new Error("CJS: /pixi createPixiSpriteAnimator is not a function");
  }
  try {
    pixiCJS.createPixiSpriteAnimator(null, graph, {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Cannot find module") && msg.includes("pixi.js")) {
      throw new Error(`CJS: /pixi leaked a runtime pixi.js require: ${msg}`);
    }
  }

  // ./schema — JSON subpath via createRequire
  const schema = require(resolve(root, "schemas/aispritejs-graph.schema.json"));
  if (typeof schema.$id !== "string") {
    throw new Error(`CJS: schema $id missing or not a string`);
  }
  if (!schema.$id.includes("aispritejs")) {
    throw new Error(`CJS: schema $id does not reference aispritejs: ${schema.$id}`);
  }
  if (!schema.properties || !schema.properties.animations || !schema.properties.inputs) {
    throw new Error("CJS: schema missing expected top-level properties (animations, inputs)");
  }
  if (!schema.properties.transitions || !schema.properties.states) {
    throw new Error("CJS: schema missing expected top-level properties (transitions, states)");
  }

  process.stdout.write(`CJS: CROSS-SUBPATH-OK schema.$id=${schema.$id}\n`);
}

try {
  await smokeESM();
  smokeCJS();
} catch (err) {
  process.stderr.write(
    `check-dist-subpaths FAILED: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  if (err instanceof Error && err.stack) process.stderr.write(err.stack + "\n");
  process.exit(1);
}
