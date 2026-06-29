# aispritejs

Input-driven, renderer-agnostic 2D sprite animation runtime. A JSON graph maps Number/Boolean/Trigger inputs to visual states and frames; adapters bind the chosen frame to a renderer.

> **Status: 0.5.9 - stable family-aligned surface.** Core, PixiJS adapter, atlas parser, and JSON Schema subpath are shipped.

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
    idle: { animation: "idle" },
    run: { animation: "run", speed: 1 },
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

## Core API

- `createSpriteAnimator(graph)` returns a `SpriteAnimator`.
- `setInput(name, value)` accepts Number/Boolean inputs.
- `fireTrigger(name)` consumes Trigger inputs on transition.
- `update(deltaMs)` advances time, transitions, frame index, and `onEnd`.
- `reset()` returns to the initial state.
- `dispose()` is idempotent; mutators throw `SpriteAnimatorDisposedError` afterward.
- `onStateChange(handler, options?)` and `onComplete(handler, options?)` support `once` and `signal`.

## Sharp Edges

- Non-looping states with `onEnd` transition during the same `update()` tick that completes the clip.
- `AnimatedSprite` is accepted by the Pixi adapter because it extends `Sprite`, but playback is stopped on bind so it cannot fight the adapter.
- Every reachable frame key must exist in the texture map/spritesheet; missing keys throw `MissingTextureError`.
- `duration`, `defaultFrameDuration`, and state `speed` must be finite numbers greater than zero.

## AI Context

- Short index: [`llms.txt`](llms.txt)
- Full generated context: [`llms-full.txt`](llms-full.txt)
- Stability contract: [`STABILITY.md`](STABILITY.md)
- Current review backlog: [`REVIEW.md`](REVIEW.md)
- Examples index: [`examples/README.md`](examples/README.md)
- Release history: [`CHANGELOG.md`](CHANGELOG.md)

## License

MIT
