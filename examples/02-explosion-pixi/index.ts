// Example 02 — a 6-frame explosion sprite sheet driven through the real
// `aispritejs/pixi` adapter. Run with:
//   pnpm example:explosion
//
// This is the most-common entry: a one-shot hit/impact FX (net-splash, muzzle
// flash, …) backed by a texture atlas. A Trigger fires a NON-LOOPING animation
// that plays once and auto-returns to a hidden idle frame. The `/pixi` adapter
// binds the renderer-agnostic core to a real `PIXI.Sprite`, swapping its
// texture to the active frame each `update(dt)`.
//
// It runs headlessly in Node (no GPU / canvas): the adapter only reads/writes
// `sprite.texture`, `sprite.anchor`, and `texture.defaultAnchor`, so plain
// `PIXI.Texture` / `PIXI.Sprite` instances are enough to exercise the real API.

import { Sprite, Texture } from "pixi.js";
import type { SpriteGraph } from "../../src/index.js";
import { createPixiSpriteAnimator } from "../../src/pixi/index.js";

// 6-frame explosion sheet. In a real project these frame keys come from a
// PixiJS-v8 spritesheet atlas (`meta` / `frames` / `animations`); here only the
// `animations` lists and per-frame `frames` durations matter to the core.
const FRAME_KEYS = [
  "explosion_0",
  "explosion_1",
  "explosion_2",
  "explosion_3",
  "explosion_4",
  "explosion_5",
] as const;

const graph: SpriteGraph = {
  // Atlas `animations` block: the named clip → its ordered frame keys.
  animations: {
    explosion: [...FRAME_KEYS],
    // A 1-frame "off" clip so the sprite has a stable resting frame to hold
    // between detonations (here we reuse the first explosion frame).
    idle: ["explosion_0"],
  },
  // Per-frame display time (ms). A snappy ~40 ms/frame burst (≈240 ms total).
  frames: {
    explosion_0: { duration: 40 },
    explosion_1: { duration: 40 },
    explosion_2: { duration: 40 },
    explosion_3: { duration: 40 },
    explosion_4: { duration: 40 },
    explosion_5: { duration: 40 },
  },
  // aispritejs control block — input-driven, not event-driven.
  inputs: {
    detonate: { type: "trigger" },
  },
  states: {
    // Resting state: hold a single frame, waiting for the trigger.
    idle: { animation: "idle", loop: true },
    // Play-once burst: non-looping, auto-returns to idle when the clip ends.
    boom: { animation: "explosion", loop: false, onEnd: "idle" },
  },
  transitions: [
    // Any-State → boom on `detonate`; the trigger is consumed when taken, and a
    // trigger-bearing self-transition restarts the clip if you re-detonate
    // mid-burst (re-trigger FX).
    { from: "*", to: "boom", when: [{ input: "detonate", op: "Trigger" }], priority: 10 },
  ],
  initial: "idle",
};

// Build the atlas textures. A real app passes a `PIXI.Spritesheet` (the adapter
// reads its `.textures`); here we build the frame-key → `Texture` map directly,
// one distinct `Texture` per frame so the swaps are observable. Each frame
// carries a centre `defaultAnchor`, which the adapter applies on frame change.
const source = Texture.EMPTY.source;
const textures: Record<string, Texture> = {};
for (const key of FRAME_KEYS) {
  // `defaultAnchor` is set via the constructor (it is read-only afterwards); the
  // adapter applies it to the sprite's anchor on each frame change.
  textures[key] = new Texture({ source, label: key, defaultAnchor: { x: 0.5, y: 0.5 } });
}

// A plain `Sprite` for the adapter to own. Its texture/anchor track the frame.
const sprite = new Sprite(textures.explosion_0);

const view = createPixiSpriteAnimator(sprite, graph, textures);

// The `/pixi` adapter surfaces `activeState` / `activeFrameKey` (plus `update`,
// `setInput`, `fireTrigger`, `reset`, `dispose`) and also delegates
// `onComplete` / `onStateChange` from the core `SpriteAnimator`, so the
// play-once completion below could instead be observed directly via
// `view.onComplete(...)`; this example infers it from the state change
// (`boom → idle`) to keep the walkthrough linear.
function tick(label: string, dt: number): void {
  const before = view.activeState;
  view.update(dt);
  const ended = before === "boom" && view.activeState === "idle" ? "  (burst complete → idle)" : "";
  console.log(
    `${label.padEnd(20)} dt=${String(dt).padStart(3)}  ${view.activeState}/${view.activeFrameKey}  ` +
      `sprite.texture=${sprite.texture.label}${ended}`,
  );
}

console.log(
  "start:",
  view.activeState,
  view.activeFrameKey,
  "→ sprite.texture =",
  sprite.texture.label,
);

console.log("\n# detonate (one-shot trigger → play-once burst)");
view.fireTrigger("detonate");
tick("update", 0); // transition into boom, bind frame 0
tick("update", 40); // explosion_1
tick("update", 40); // explosion_2
tick("update", 40); // explosion_3
tick("update", 40); // explosion_4
tick("update", 40); // explosion_5 (last frame)
tick("update", 40); // clip ends → onEnd auto-returns boom → idle

console.log("\n# resting (no input) — holds idle frame");
tick("update", 100);

view.dispose();
console.log("\ndisposed:", view.disposed);
