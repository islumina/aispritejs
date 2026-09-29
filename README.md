# aispritejs

Input-driven, renderer-agnostic 2D sprite animation runtime. A JSON graph maps Number/Boolean/Trigger inputs to visual states and frames; adapters bind the chosen frame to a renderer.

> **Status: 0.6.0 - stable family-aligned surface.** Core, PixiJS adapter, atlas parser, and JSON Schema subpath are shipped.

## Install

```bash
pnpm add aispritejs
pnpm add pixi.js # only when using aispritejs/pixi
```

```ts
import { createSpriteAnimator } from "aispritejs";
```

## Quick Start - Core

```ts
const anim = createSpriteAnimator({
  inputs: {
    speed: { type: "number", default: 0 },
    jump: { type: "trigger" },
  },
  initial: "idle",
  states: {
    idle: { animation: "idle", loop: true },
    run: { animation: "run", loop: true, speed: 1 },
    jump: { animation: "jump", loop: false, onEnd: "idle" },
  },
  transitions: [
    { from: "idle", to: "run", when: [{ input: "speed", op: "GreaterThan", value: 0 }] },
    { from: "*", to: "jump", when: [{ input: "jump", op: "Trigger" }] },
  ],
  animations: {
    idle: ["idle_0"],
    run: ["run_0", "run_1"],
    jump: ["jump_0", "jump_1"],
  },
});

anim.setInput("speed", 1);
anim.fireTrigger("jump");
anim.update(16.7);
console.log(anim.activeState, anim.activeFrameKey);
```

## PixiJS Adapter

```ts
import { createPixiSpriteAnimator } from "aispritejs/pixi";

const view = createPixiSpriteAnimator(sprite, graph, spritesheet);
view.update(deltaMs);
view.dispose(); // disposes core animator; does not destroy the Pixi sprite
```

`pixi.js` is an optional peer dependency and is imported type-only by the adapter. The root package never imports Pixi, DOM, or canvas APIs.

## Atlas and Schema

- `parseAtlas(atlas, control?)` converts a PixiJS-v8 style atlas plus control block into a `SpriteGraph`.
- `loadAtlas(atlas, control?)` parses and creates a `SpriteAnimator`.
- `aispritejs/schema` exports `schemas/aispritejs-graph.schema.json` for editor/CI validation.
- Parser validation is structural (`InvalidAtlasError`); compiler validation is semantic (`InvalidGraphError`).
- An explicit `control` gets the same structural checks as a control block inside the atlas, and its `initial` / `defaultFrameDuration` must be a string / number (an atlas's own block drops wrong-typed ones).

## Core API

- `createSpriteAnimator(graph)` returns a `SpriteAnimator`; a malformed or invalid graph throws `InvalidGraphError` and builds nothing.
- `setInput(name, value)` accepts Number/Boolean inputs.
- `fireTrigger(name)` consumes Trigger inputs on transition.
- `update(deltaMs)` advances time, transitions, frame index, and `onEnd`. A negative, non-finite, or overflowing step is clamped to no progress.
- `reset()` returns to the initial state.
- `dispose()` is idempotent; mutators throw `SpriteAnimatorDisposedError` afterward.
- `onStateChange(handler, options?)` and `onComplete(handler, options?)` support `once` and `signal`.

## Sharp Edges

- Non-looping states with `onEnd` transition during the same `update()` tick that completes the clip.
- `reset()`/`update()` called from inside `onStateChange`/`onComplete` run after the current update finishes (including its `onEnd` auto-transition); a `reset()` from `onComplete` therefore yields `onStateChange(onEndTarget, from)` then `onStateChange(initial, onEndTarget)`, ending in the initial state; `dispose()` from a listener stops the update immediately.
- `AnimatedSprite` is accepted by the Pixi adapter because it extends `Sprite`, but playback is stopped on bind so it cannot fight the adapter.
- Every frame key in every declared animation must exist in the texture map/spritesheet — including an animation no state references — or the adapter throws `MissingTextureError` at construction. A `null` / `undefined` entry counts as missing.
- A texture map with an object under the key `textures` is read as a `Spritesheet`; if a frame is literally named `textures`, pass the `Spritesheet` (or `{ textures: map }`) instead of the bare map.
- `duration`, `defaultFrameDuration`, and state `speed` must be finite numbers greater than zero.
- `initial`, state `animation` / `onEnd`, transition `from` / `to`, and condition `input` / `op` must be strings, and a transition `priority` must be an integer.

## AI Context

- Short index: [`llms.txt`](llms.txt)
- Full generated context: [`llms-full.txt`](llms-full.txt)
- Stability contract: [`STABILITY.md`](STABILITY.md)
- Current review backlog: [`REVIEW.md`](REVIEW.md)
- Examples index: [`examples/README.md`](examples/README.md)
- Release history: [`CHANGELOG.md`](CHANGELOG.md)

## License

MIT
