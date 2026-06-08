// aispritejs/pixi — the PixiJS v8 renderer adapter. It binds the
// renderer-agnostic core to a `PIXI.Sprite`: on each update it swaps the
// sprite's texture to the core's active frame and (by default) applies that
// frame's atlas anchor.
//
// `pixi.js` is imported **type-only**, so the built subpath contains no runtime
// `pixi.js` require — the peer is needed only by the consumer who passes real
// Sprite / Spritesheet instances. `pixi.js` is declared as an OPTIONAL
// peerDependency; the core (`aispritejs`) never imports this module.

import type { Sprite, Spritesheet, Texture } from "pixi.js";
import {
  type CompleteHandler,
  type ListenerOptions,
  type SpriteGraph,
  type StateChangeHandler,
  type Unsubscribe,
  createSpriteAnimator,
} from "../sprite/index.js";

/**
 * Thrown by {@link createPixiSpriteAnimator} when the supplied textures are
 * missing one or more frame keys the graph's animations reference. Fail-fast at
 * construction, so `update()` never has to guard.
 *
 * @public
 */
export class MissingTextureError extends Error {
  readonly keys: readonly string[];
  constructor(keys: readonly string[]) {
    super(`aispritejs/pixi: no texture for frame key(s): ${keys.join(", ")}`);
    this.name = "MissingTextureError";
    this.keys = keys;
  }
}

/** Frame-key → texture lookup. A PixiJS `Spritesheet` exposes one as `.textures`. */
export type TextureMap = Record<string, Texture>;

/**
 * Options for {@link createPixiSpriteAnimator}.
 *
 * @public
 */
export interface PixiSpriteAnimatorOptions {
  /**
   * Apply each frame's atlas anchor (`texture.defaultAnchor`) to the sprite when
   * the frame changes — preserving non-centre / foot pivots. Default `true`.
   * Set `false` to manage the anchor yourself.
   */
  readonly applyAnchor?: boolean;
}

/**
 * A PixiJS-bound animator: the core machine plus a sprite whose texture tracks
 * the active frame.
 *
 * @public
 */
export interface PixiSpriteAnimator {
  /** The bound sprite, updated in place. */
  readonly sprite: Sprite;
  /** Run the core machine for `deltaMs`, then sync the sprite's texture. */
  update(deltaMs: number): void;
  /** Set a Number / Boolean input on the core machine. */
  setInput(name: string, value: number | boolean): void;
  /** Fire a Trigger on the core machine. */
  fireTrigger(name: string): void;
  /** Reset the core machine and re-sync the sprite. */
  reset(): void;
  /** Dispose the core machine. Idempotent. Does not destroy the sprite. */
  dispose(): void;
  /** Current state name. */
  readonly activeState: string;
  /** Current frame key. */
  readonly activeFrameKey: string;
  /** `true` once disposed. */
  readonly disposed: boolean;
  /** Subscribe to non-looping clip completions. Returns an unsubscribe. */
  onComplete(handler: CompleteHandler, options?: ListenerOptions): Unsubscribe;
  /** Subscribe to state changes. Returns an unsubscribe. */
  onStateChange(handler: StateChangeHandler, options?: ListenerOptions): Unsubscribe;
}

function toTextureMap(src: Spritesheet | TextureMap): TextureMap {
  // A Spritesheet exposes its frame textures under `.textures`; a plain map is
  // used directly. (If you have a frame literally named "textures", pass
  // `spritesheet.textures` instead of the spritesheet.)
  const maybe = src as { textures?: unknown };
  if (maybe.textures && typeof maybe.textures === "object") {
    return maybe.textures as TextureMap;
  }
  return src as TextureMap;
}

/**
 * Bind an input-driven {@link SpriteGraph} to a PixiJS `Sprite`.
 *
 * @param sprite - a plain `Sprite` to drive; its `texture` (and, by default,
 *   `anchor`) are updated in place. The adapter owns frame selection, so if a
 *   *playing* `AnimatedSprite` is passed (it extends `Sprite`), its internal
 *   playback is stopped to stop it fighting the adapter for the texture.
 * @param graph - the input-driven graph (same shape the core consumes).
 * @param textures - a `Spritesheet` or a frame-key → `Texture` map covering
 *   every frame the graph references.
 * @param options - see {@link PixiSpriteAnimatorOptions}.
 * @returns a {@link PixiSpriteAnimator}.
 * @throws {@link MissingTextureError} if a referenced frame key has no texture.
 * @throws {@link InvalidGraphError} if the graph is invalid.
 *
 * @public
 */
export function createPixiSpriteAnimator(
  sprite: Sprite,
  graph: SpriteGraph,
  textures: Spritesheet | TextureMap,
  options?: PixiSpriteAnimatorOptions,
): PixiSpriteAnimator {
  const map = toTextureMap(textures);
  const applyAnchor = options?.applyAnchor !== false;

  // The adapter owns the sprite's texture/anchor. An AnimatedSprite (which
  // extends Sprite, so the type permits it) drives its own texture from an
  // internal ticker; if it is playing it would fight our frame swaps. Stop it.
  // Structural check — pixi.js is type-only here, so no `instanceof`.
  const playable = sprite as { stop?: () => void };
  if (typeof playable.stop === "function") playable.stop();

  // Fail-fast: every frame key reachable from the graph must have a texture.
  const missing = new Set<string>();
  for (const frameKeys of Object.values(graph.animations)) {
    for (const key of frameKeys) {
      if (!(key in map)) missing.add(key);
    }
  }
  if (missing.size > 0) throw new MissingTextureError([...missing]);

  const core = createSpriteAnimator(graph);

  // Swap the sprite's texture (and anchor) only when the active frame changes.
  let boundKey = "";
  function sync(): void {
    const key = core.activeFrameKey;
    if (key === boundKey) return;
    boundKey = key;
    const tex = map[key]!; // verified present above
    sprite.texture = tex;
    if (applyAnchor && tex.defaultAnchor) {
      sprite.anchor.set(tex.defaultAnchor.x, tex.defaultAnchor.y);
    }
  }
  sync(); // bind the initial frame before the first update

  return {
    sprite,
    update(deltaMs) {
      core.update(deltaMs);
      sync();
    },
    setInput(name, value) {
      core.setInput(name, value);
    },
    fireTrigger(name) {
      core.fireTrigger(name);
    },
    reset() {
      core.reset();
      sync();
    },
    dispose() {
      core.dispose();
    },
    get activeState() {
      return core.activeState;
    },
    get activeFrameKey() {
      return core.activeFrameKey;
    },
    get disposed() {
      return core.disposed;
    },
    onComplete(handler, options) {
      return core.onComplete(handler, options);
    },
    onStateChange(handler, options) {
      return core.onStateChange(handler, options);
    },
  };
}
