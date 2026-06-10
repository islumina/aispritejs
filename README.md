# aispritejs

[![npm version](https://img.shields.io/npm/v/aispritejs.svg)](https://www.npmjs.com/package/aispritejs)
[![CI](https://github.com/islumina/aispritejs/actions/workflows/ci.yml/badge.svg)](https://github.com/islumina/aispritejs/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-brightgreen.svg)](LICENSE)
[![AI Generated](https://img.shields.io/badge/AI_Generated-Claude_Code_Opus_4.8-blueviolet.svg)](https://www.anthropic.com/claude-code)
[![繁體中文](https://img.shields.io/badge/lang-繁體中文-red.svg)](README_ZHTW.md)

> Input-driven, renderer-agnostic 2D sprite animation runtime — a tiny, Rive-like *visual* state machine driven by `Number` / `Boolean` / `Trigger` inputs.

`aispritejs` decides **which animation frame is on screen** from a small set of runtime **inputs** (e.g. `speed`, `isGrounded`, `jump`), using a JSON-defined transition graph. Your code sets inputs; `aispritejs` picks the visual state and ticks the active frame. The core is pure TypeScript with **zero dependencies** and **no renderer imports** — bind it to PixiJS v8 (or anything) through a thin adapter.

Part of the **ai\*js** family: zero cross-package dependencies, framework-agnostic core, AI-readable docs.

> **Status: 0.5.6 — aligned with the ai\*js family version line.** Renderer-agnostic core plus `/pixi`, `/atlas`, `/schema` subpaths; hardened atlas/graph validation. See [CHANGELOG.md](CHANGELOG.md) for history.

## Why aispritejs

- **Input-driven, not name-driven.** You set parameters (`speed=4`, `isGrounded=false`, `fireTrigger("jump")`), not animation names. Visual transitions live in data, decoupled from game code.
- **Renderer-agnostic core.** The state machine computes the active frame from delta-time + inputs; it never imports PixiJS or touches the DOM. Adapters map the result to textures.
- **Visual ≠ logic.** This is strictly a *visual* animator. It is **not** a game-logic FSM and does **not** depend on `aifsmjs`. Drive it from any logic layer (plain code, an FSM, an ECS) — they compose by convention, never by dependency.
- **Tiny + fast.** O(1) input lookups, O(N) checks over transitions leaving the current state, no per-frame allocation.

## When you DON'T need aispritejs

`aispritejs` earns its keep when frame selection is **driven by runtime inputs** across **several visual states**. Below that threshold, reach for PixiJS directly — there is nothing to gain from a state machine:

- **A single sprite / one static image** → a plain PixiJS [`Sprite`](https://pixijs.download/release/docs/scene.Sprite.html). No animation, no graph.
- **One looping clip with no branching** (a coin spin, a torch flicker) → a PixiJS [`AnimatedSprite`](https://pixijs.download/release/docs/scene.AnimatedSprite.html) (`AnimatedSprite.fromFrames(...)`, `.play()`). One clip that always plays the same way needs no inputs.
- **No texture atlas** (you aren't packing frames into a spritesheet) → load images directly; `aispritejs` reads its frames from a PixiJS-v8 atlas (`animations` / `frames`).
- **No multi-state switching** — if your code already knows exactly which clip to play and just calls `.play()` / `.gotoAndStop()`, you don't need a transition graph.

Reach for `aispritejs` when you have **input-driven, multi-state visual switching backed by a texture atlas** — e.g. `idle ⇄ walk → jump`, or a one-shot hit FX fired by a trigger — where which frame is on screen is a function of `speed` / `isGrounded` / `attack`, not a hard-coded `play()` call.

## Mental model

```
inputs ─▶ [transition graph] ─▶ active state ─▶ (Δt) ─▶ active frame ─▶ adapter ─▶ texture
```

- **Inputs** — `Number` (continuous, e.g. `speed`), `Boolean` (toggle, e.g. `isGrounded`), `Trigger` (one-shot; auto-resets after a transition consumes it, e.g. `jump` / `attack`).
- **States** — an animation key (into the atlas `animations`) + loop / on-end behaviour + optional speed multiplier.
- **Transitions** — from a state (or **Any State**) to another when conditions over inputs hold (`Equals` / `NotEquals` / `GreaterThan` / `LessThan` / `Trigger`). The highest-priority satisfied transition wins.
- **`update(dt)`** — advances the playback timer; evaluates transitions (switching state, firing `onStateChange`, consuming triggers); computes the current frame from the animation's per-frame durations + loop; fires `onComplete` when a non-looping clip ends.

## Quick start — core (zero-dep)

```ts
import { createSpriteAnimator } from "aispritejs";

const anim = createSpriteAnimator(graph); // graph = { inputs, states, transitions, animations }

anim.setInput("speed", 4);
anim.setInput("isGrounded", true);
anim.fireTrigger("jump");

anim.onStateChange((to, from) => {/* ... */});
anim.onComplete((state) => {/* ... */});

// in your render loop:
anim.update(deltaMs);
const frameKey = anim.activeFrameKey; // hand to your renderer
```

## Quick start — PixiJS v8 adapter

The `aispritejs/pixi` subpath binds the core to a `PIXI.Sprite`. `pixi.js` is an **optional** `peerDependency`, imported **type-only** — the built adapter contains no runtime `pixi.js` require, and the core never imports it.

```ts
import { createPixiSpriteAnimator } from "aispritejs/pixi"; // pixi.js is an OPTIONAL peer

// `textures` is a PIXI.Spritesheet (or a frame-key → Texture map) covering
// every frame the graph references — missing keys throw MissingTextureError.
const view = createPixiSpriteAnimator(sprite, graph, spritesheet);

// each frame:
view.update(deltaMs); // swaps the bound sprite's texture to the active frame,
                      // applying that frame's atlas anchor (texture.defaultAnchor)

view.setInput("speed", 4);
view.fireTrigger("jump");
```

It swaps the texture only when the active frame changes, and honours per-frame `duration` (via the core) and non-centre / foot pivots (via `texture.defaultAnchor`; pass `{ applyAnchor: false }` to manage the anchor yourself). `view.sprite` is the bound sprite; `dispose()` tears down the core without destroying the sprite.

Pass a plain `Sprite` — the adapter owns frame selection. (An `AnimatedSprite` is accepted since it extends `Sprite`, but its own playback is stopped on bind so it cannot fight the adapter for the texture.)

### Complete example — a 6-frame explosion (play-once FX)

The most common entry: a one-shot hit/impact FX (net-splash, muzzle flash) from a **6-frame explosion sprite sheet**, driven through the `/pixi` adapter. A `Trigger` fires a **non-looping** clip that plays once and auto-returns to a resting frame via `onEnd`. The full runnable version is [`examples/02-explosion-pixi/index.ts`](examples/02-explosion-pixi/index.ts) (`pnpm example:explosion`).

```ts
import { Assets, Sprite } from "pixi.js";
import { createPixiSpriteAnimator } from "aispritejs/pixi";

// A 6-frame explosion sprite sheet (PixiJS-v8 atlas): the `animations` block
// names the clip → its frame keys; `frames` carries per-frame durations.
const graph = {
  animations: {
    explosion: ["explosion_0", "explosion_1", "explosion_2", "explosion_3", "explosion_4", "explosion_5"],
    idle: ["explosion_0"], // a 1-frame resting clip to hold between bursts
  },
  frames: {
    explosion_0: { duration: 40 }, explosion_1: { duration: 40 }, explosion_2: { duration: 40 },
    explosion_3: { duration: 40 }, explosion_4: { duration: 40 }, explosion_5: { duration: 40 },
  },
  inputs: { detonate: { type: "trigger" } },
  states: {
    idle: { animation: "idle", loop: true },
    boom: { animation: "explosion", loop: false, onEnd: "idle" }, // play once → back to idle
  },
  transitions: [
    { from: "*", to: "boom", when: [{ input: "detonate", op: "Trigger" }], priority: 10 },
  ],
  initial: "idle",
} as const;

// Load the packed sheet; its `.textures` cover every frame key the graph uses.
const sheet = await Assets.load("explosion.json"); // a PIXI.Spritesheet
const sprite = new Sprite();
const fx = createPixiSpriteAnimator(sprite, graph, sheet);

// Fire the one-shot trigger on impact:
fx.fireTrigger("detonate");

// Drive the burst from your PixiJS render loop (e.g. `app.ticker`), advancing by
// elapsed ms: `app.ticker.add((ticker) => fx.update(ticker.deltaMS))`.
```

`update(dt)` plays `explosion_0…explosion_5` once (honouring each frame's `duration`); on the tick that completes the clip it fires `onComplete` and, because `boom` declares `onEnd`, auto-transitions to `idle` in that **same** tick — so the last frame isn't held, and `activeState` reads `idle` right after. Re-`fireTrigger("detonate")` to replay. The same graph runs with no renderer — see [`examples/02-explosion-pixi/index.ts`](examples/02-explosion-pixi/index.ts), which exercises the real adapter headlessly with plain `Texture` / `Sprite` instances.

## Data format (atlas)

`aispritejs` reads a **PixiJS v8-native** spritesheet atlas (`meta` / `frames` / `animations`) — the same shape the family's sprite pipeline emits — augmented with an `aispritejs` **input-driven** control block:

```jsonc
{
  "meta":   { "image": "sheet.png", "size": { "w": 1024, "h": 1024 }, "scale": "1" },
  "frames": { /* PixiJS native: frame{x,y,w,h}, anchor, duration, trimmed, ... */ },
  "animations": { "idle": ["idle_0", "idle_1"], "walk": ["walk_0", "..."], "jump": ["jump_0", "..."] },

  "inputs": {
    "speed":      { "type": "number",  "default": 0 },
    "isGrounded": { "type": "boolean", "default": true },
    "jump":       { "type": "trigger" }
  },
  "states": {
    "idle": { "animation": "idle", "loop": true },
    "walk": { "animation": "walk", "loop": true },
    "jump": { "animation": "jump", "loop": false }
  },
  "transitions": [
    { "from": "*",    "to": "jump", "when": [{ "input": "jump",  "op": "Trigger" }], "priority": 10 },
    { "from": "idle", "to": "walk", "when": [{ "input": "speed", "op": "GreaterThan", "value": 0 }] },
    { "from": "walk", "to": "idle", "when": [{ "input": "speed", "op": "Equals",      "value": 0 }] }
  ]
}
```

This **input-driven** model is deliberately distinct from an event-driven FSM. `aispritejs` ingests only the universal `frames` / `animations`; the `inputs` / `states` / `transitions` are its own. If an atlas carries a foreign event-driven `states` block from another tool, `aispritejs` ignores it.

## Loading an atlas — `aispritejs/atlas`

The `aispritejs/atlas` subpath turns a parsed PixiJS-v8 atlas into a graph (or a ready animator). It is pure and zero-dependency.

```ts
import { parseAtlas, loadAtlas } from "aispritejs/atlas";

// Augmented atlas (the shape above, with inputs/states/transitions inline):
const anim = loadAtlas(atlasJson);

// Real atlas whose own `states` block is foreign (event-driven) or absent —
// supply the input-driven control separately; the foreign block is ignored:
const graph = parseAtlas(atlasJson, { inputs, states, transitions, initial });
```

- `parseAtlas(atlas, control?)` → `SpriteGraph`; `loadAtlas(atlas, control?)` → `SpriteAnimator` (parse + create in one fail-fast step).
- A foreign event-driven `states` block (the `{ initial, definitions }` FSM shape) is **detected and ignored** — pass an `aispritejs` control block instead. Structural problems throw `InvalidAtlasError`; semantic ones surface as `InvalidGraphError` from the core.
- The canonical structure is published as a JSON Schema at [`schemas/aispritejs-graph.schema.json`](schemas/aispritejs-graph.schema.json) (also exported as `aispritejs/schema`) for editor and CI validation; the parser mirrors it in code, so there is no runtime schema-validator dependency.

## Decoupling (P0)

- **Zero cross-package imports** — `aispritejs` does not import `aifsmjs`, `aieventjs`, or any sibling. It has its own minimal typed emitter.
- **Renderer-agnostic core** — the root entry never imports `pixi.js`. Only `aispritejs/pixi` does, and `pixi.js` is an **optional `peerDependency`**.
- **Visual animator only** — pair it with a game-logic layer by setting inputs; it makes no assumption about how your logic is structured.

## Core API

The public surface is a single factory plus types and named errors. There is **no exported class constructor** — `createSpriteAnimator` returns a `SpriteAnimator`.

```ts
const anim = createSpriteAnimator(graph); // throws InvalidGraphError on a bad graph

anim.setInput(name, value);   // Number | Boolean; throws Unknown/InputTypeError
anim.fireTrigger(name);       // marks a Trigger pending
anim.update(deltaMs);         // advance; evaluate transitions; tick the frame
anim.reset();                 // back to initial + default inputs (keeps buffers)
anim.dispose();               // idempotent; mutators throw afterwards

const off = anim.onStateChange((to, from) => {}, { signal?, once? }); // → unsubscribe
const off2 = anim.onComplete((state) => {}, { signal?, once? });

anim.activeState;       // current state name
anim.activeFrameKey;    // frame key into the atlas `frames` — hand to a renderer
anim.activeFrameIndex;  // index within the active animation
anim.disposed;          // boolean
```

Every subscription returns an unsubscribe function and accepts `{ signal }` (an `AbortSignal` that removes the listener) and `{ once }`.

## Semantics (the precise rules)

These rules are deterministic and frozen for the 1.x line once 1.0 ships:

- **`update(dt)` order** — advance the timer by `dt × speed` (non-finite or non-positive `dt` clamps to `0`); evaluate transitions; recompute the active frame; fire `onComplete` for a finished non-looping clip and then any `onEnd` auto-transition. An explicit input transition therefore wins over end-of-clip behaviour on the same frame.
- **Transition resolution** — among the transitions leaving the current state (plus **Any-State** `from: "*"`), candidates are ordered by `priority` (desc) then declared order (asc); the **first effective** one is taken. All `when` conditions must hold (logical AND).
- **Self-transition rule** — a transition whose `to` equals the current state is *effective only if it consumes a Trigger*. A Number/Boolean self-loop is skipped, so it cannot reset the clip to frame 0 every frame. A trigger-bearing self-transition **restarts** the clip (e.g. re-attack) but does **not** fire `onStateChange` (the state name is unchanged).
- **Triggers** — `fireTrigger(name)` marks a trigger pending; it stays pending across frames until a transition that checks it is taken, which **consumes** it. One fire → at most one transition.
- **Frame timing** — the active frame is the first whose cumulative duration exceeds the elapsed time. Looping clips wrap at the total duration; non-looping clips hold the last frame and fire `onComplete` exactly once. Per-frame `duration` comes from the atlas `frames`; frames without one use `defaultFrameDuration` (default `100` ms). `speed` is a time-scale multiplier (`2` = twice as fast).
- **Determinism** — identical input + `dt` sequences always yield identical frame sequences. The no-transition path allocates nothing.

## Errors

Named errors, never bare throws:

- `InvalidGraphError` — thrown by `createSpriteAnimator` when the graph fails validation (missing animation, unknown transition target, operator/kind mismatch, non-positive duration/speed, `onEnd` with `loop:true`, …). Fail-fast: an invalid graph never yields a half-built animator.
- `UnknownInputError` — `setInput` / `fireTrigger` on an input not declared in `inputs` (carries `.input`).
- `InputTypeError` — wrong value type, `setInput` on a Trigger, or `fireTrigger` on a non-Trigger (carries `.input`).
- `SpriteAnimatorDisposedError` — any mutator (`setInput` / `fireTrigger` / `update` / `reset`) after `dispose()`.

## Comparison

| | aispritejs | Rive | aifsmjs | raw `AnimatedSprite` |
|---|---|---|---|---|
| Control model | input-driven (Number/Boolean/Trigger) | input-driven | event-driven (logic) | manual |
| Scope | visual animation | visual animation | game logic | playback only |
| Runtime | tiny TS, no wasm | wasm runtime | tiny TS | — |
| Renderer | agnostic + adapters | own | n/a | PixiJS |

`aispritejs` and `aifsmjs` are complementary — logic FSM sets inputs, visual animator picks frames — and never coupled.

## AI-agent reading guide

- **Whole context in one fetch** — [`llms-full.txt`](llms-full.txt) concatenates this README, the changelog, the contributing guide, and the examples index.
- **Source layout** — the core lives in [`src/sprite/`](src/sprite/): `types.ts` (every public type in one file), `machine.ts` (the `createSpriteAnimator` engine), `compile.ts` (graph validation + normalisation), `inputs.ts` (the input store), `emitter.ts` (the own typed signal), `errors.ts`. The root [`src/index.ts`](src/index.ts) re-exports the public surface and imports **no** renderer.
- **Stability tiers** — see [STABILITY.md](STABILITY.md).

## Testing

Behavioural `vitest` suites cover inputs, transitions, trigger consumption, frame timing, `onComplete` / `onEnd`, subscriptions (`signal` / `once`), `dispose` / `reset`, and graph validation. `fast-check` property tests assert **transition determinism** (identical input + `dt` sequences ⇒ identical frame traces) and **trigger consumption** (one fire ⇒ one entry). Coverage runs at the family floor (≥95 % statements / ≥90 % branches / 100 % functions-and-lines).

```bash
pnpm test        # run once
pnpm coverage    # with thresholds
pnpm example:platformer  # renderer-free core demo
pnpm example:explosion   # 6-frame play-once FX via the /pixi adapter
```

## Status

**v0.5.6 — aligned with the ai\*js family version line.** The package version is now synchronised with the shared family version (`0.5.x`), as recorded in [CHANGELOG.md](CHANGELOG.md). All four roadmap modules are live: the renderer-agnostic core (`.`), the PixiJS v8 adapter (`aispritejs/pixi`), the atlas parser (`aispritejs/atlas`), and the JSON Schema (`aispritejs/schema`). Prior hardening waves delivered compile-time rejection of non-finite `speed` / `duration` / `defaultFrameDuration`, runtime clamping of non-finite or non-positive `dt` to `0` in `update()`, and named-error coverage for hostile atlas shapes. Zero runtime dependencies; the root import graph contains no `pixi.js`; `pixi.js` is an optional, type-only peer used only by the `/pixi` subpath.

## Roadmap

See [ROADMAP.md](ROADMAP.md).

## License

MIT © yshengliao — see [LICENSE](LICENSE).
