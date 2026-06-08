import type { Sprite, Spritesheet, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import type { SpriteGraph } from "../src/index.js";
import { MissingTextureError, createPixiSpriteAnimator } from "../src/pixi/index.js";

// The adapter imports pixi.js type-only, so structural doubles drive it without
// a renderer. `fakeTexture` carries just `defaultAnchor`; `makeSprite` records
// texture writes and anchor.set calls for assertions.

function fakeTexture(anchor?: { x: number; y: number }): Texture {
  return { defaultAnchor: anchor } as unknown as Texture;
}

interface SpriteProbe {
  texture: Texture | undefined;
  textureWrites: number;
  anchorX: number;
  anchorY: number;
  anchorSetCalls: number;
  asSprite(): Sprite;
}

function makeSprite(): SpriteProbe {
  let tex: Texture | undefined;
  const probe = {
    textureWrites: 0,
    anchorX: -1,
    anchorY: -1,
    anchorSetCalls: 0,
    anchor: {
      set(x: number, y: number) {
        probe.anchorX = x;
        probe.anchorY = y;
        probe.anchorSetCalls++;
      },
    },
    get texture(): Texture | undefined {
      return tex;
    },
    set texture(t: Texture | undefined) {
      tex = t;
      probe.textureWrites++;
    },
    asSprite(): Sprite {
      return probe as unknown as Sprite;
    },
  };
  return probe;
}

function graph(): SpriteGraph {
  return {
    animations: { idle: ["idle_0", "idle_1"], walk: ["walk_0", "walk_1"] },
    frames: {
      idle_0: { duration: 100 },
      idle_1: { duration: 100 },
      walk_0: { duration: 100 },
      walk_1: { duration: 100 },
    },
    inputs: { speed: { type: "number", default: 0 }, jump: { type: "trigger" } },
    states: { idle: { animation: "idle", loop: true }, walk: { animation: "walk", loop: true } },
    transitions: [
      { from: "idle", to: "walk", when: [{ input: "speed", op: "GreaterThan", value: 0 }] },
    ],
    initial: "idle",
  };
}

function textureMap(): Record<string, Texture> {
  return {
    idle_0: fakeTexture({ x: 0.5, y: 0.86 }),
    idle_1: fakeTexture({ x: 0.5, y: 0.86 }),
    walk_0: fakeTexture({ x: 0.4, y: 0.9 }),
    walk_1: fakeTexture({ x: 0.4, y: 0.9 }),
  };
}

describe("createPixiSpriteAnimator", () => {
  it("binds the initial frame and applies its atlas anchor on construction", () => {
    const s = makeSprite();
    const map = textureMap();
    const view = createPixiSpriteAnimator(s.asSprite(), graph(), map);
    expect(view.activeState).toBe("idle");
    expect(view.activeFrameKey).toBe("idle_0");
    expect(s.texture).toBe(map.idle_0);
    expect(s.anchorX).toBeCloseTo(0.5);
    expect(s.anchorY).toBeCloseTo(0.86);
    expect(s.anchorSetCalls).toBe(1);
  });

  it("swaps the texture only when the active frame changes", () => {
    const s = makeSprite();
    const view = createPixiSpriteAnimator(s.asSprite(), graph(), textureMap());
    expect(s.textureWrites).toBe(1); // initial bind
    view.update(0); // still idle_0
    expect(s.textureWrites).toBe(1);
    view.update(100); // → idle_1
    expect(view.activeFrameKey).toBe("idle_1");
    expect(s.textureWrites).toBe(2);
  });

  it("follows core transitions and honours the new frame's anchor", () => {
    const s = makeSprite();
    const map = textureMap();
    const view = createPixiSpriteAnimator(s.asSprite(), graph(), map);
    view.setInput("speed", 4);
    view.update(0); // idle → walk
    expect(view.activeState).toBe("walk");
    expect(s.texture).toBe(map.walk_0);
    expect(s.anchorX).toBeCloseTo(0.4);
    expect(s.anchorY).toBeCloseTo(0.9);
  });

  it("delegates fireTrigger / reset / dispose to the core", () => {
    const g: SpriteGraph = {
      ...graph(),
      transitions: [
        { from: "*", to: "walk", when: [{ input: "jump", op: "Trigger" }], priority: 10 },
      ],
    };
    const s = makeSprite();
    const view = createPixiSpriteAnimator(s.asSprite(), g, textureMap());
    view.fireTrigger("jump");
    view.update(0);
    expect(view.activeState).toBe("walk");

    view.reset();
    expect(view.activeState).toBe("idle");
    expect(view.activeFrameKey).toBe("idle_0");

    expect(view.disposed).toBe(false);
    view.dispose();
    expect(view.disposed).toBe(true);
    expect(() => view.update(16)).toThrow();
  });

  it("does not touch the anchor when applyAnchor is false", () => {
    const s = makeSprite();
    const view = createPixiSpriteAnimator(s.asSprite(), graph(), textureMap(), {
      applyAnchor: false,
    });
    expect(s.textureWrites).toBe(1);
    expect(s.anchorSetCalls).toBe(0);
    view.update(100);
    expect(s.anchorSetCalls).toBe(0);
  });

  it("tolerates a texture with no defaultAnchor", () => {
    const s = makeSprite();
    const map: Record<string, Texture> = {
      idle_0: fakeTexture(),
      idle_1: fakeTexture(),
      walk_0: fakeTexture(),
      walk_1: fakeTexture(),
    };
    const view = createPixiSpriteAnimator(s.asSprite(), graph(), map);
    expect(s.texture).toBe(map.idle_0);
    expect(s.anchorSetCalls).toBe(0); // no anchor to apply
    view.update(100);
    expect(view.activeFrameKey).toBe("idle_1");
  });

  it("accepts a Spritesheet (reads its .textures)", () => {
    const s = makeSprite();
    const map = textureMap();
    const sheet = { textures: map, data: {} } as unknown as Spritesheet;
    const view = createPixiSpriteAnimator(s.asSprite(), graph(), sheet);
    expect(s.texture).toBe(map.idle_0);
    view.setInput("speed", 1);
    view.update(0);
    expect(s.texture).toBe(map.walk_0);
  });

  it("stops a playing AnimatedSprite so its ticker cannot fight the texture swap", () => {
    const s = makeSprite();
    let stopped = 0;
    // AnimatedSprite-like: a Sprite probe plus a stop() method (extends Sprite).
    const animated = Object.assign(s, {
      stop: () => {
        stopped++;
      },
    });
    const view = createPixiSpriteAnimator(animated.asSprite(), graph(), textureMap());
    expect(stopped).toBe(1);
    expect(view.activeFrameKey).toBe("idle_0"); // adapter still drives frames
  });

  it("throws MissingTextureError when a referenced frame has no texture", () => {
    const s = makeSprite();
    const incomplete: Record<string, Texture> = { idle_0: fakeTexture(), idle_1: fakeTexture() };
    // walk_0 / walk_1 missing
    expect(() => createPixiSpriteAnimator(s.asSprite(), graph(), incomplete)).toThrow(
      MissingTextureError,
    );
    try {
      createPixiSpriteAnimator(s.asSprite(), graph(), incomplete);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(MissingTextureError);
      expect((err as MissingTextureError).keys).toEqual(
        expect.arrayContaining(["walk_0", "walk_1"]),
      );
    }
  });
});

// A minimal graph with a non-looping "hit" state that completes after one
// 100 ms frame, plus a looping "idle" state for transition tests.
function oneShotGraph(): SpriteGraph {
  return {
    animations: { hit: ["hit_0"], idle: ["idle_0", "idle_1"] },
    frames: {
      hit_0: { duration: 100 },
      idle_0: { duration: 100 },
      idle_1: { duration: 100 },
    },
    inputs: { done: { type: "trigger" } },
    states: {
      hit: { animation: "hit", loop: false },
      idle: { animation: "idle", loop: true },
    },
    transitions: [{ from: "hit", to: "idle", when: [{ input: "done", op: "Trigger" }] }],
    initial: "hit",
  };
}

function oneShotTextureMap(): Record<string, Texture> {
  return {
    hit_0: fakeTexture(),
    idle_0: fakeTexture(),
    idle_1: fakeTexture(),
  };
}

describe("PixiSpriteAnimator — onComplete / onStateChange delegation", () => {
  it("onComplete fires exactly once when a non-looping clip completes", () => {
    const s = makeSprite();
    const view = createPixiSpriteAnimator(s.asSprite(), oneShotGraph(), oneShotTextureMap());
    const fn = vi.fn();
    view.onComplete(fn);
    view.update(100); // reaches end of hit_0 → completes
    expect(fn).toHaveBeenCalledExactlyOnceWith("hit");
  });

  it("onComplete with { once: true } auto-removes after first fire", () => {
    const s = makeSprite();
    const view = createPixiSpriteAnimator(s.asSprite(), oneShotGraph(), oneShotTextureMap());
    const fn = vi.fn();
    view.onComplete(fn, { once: true });
    view.update(100); // completes once
    view.reset();
    view.update(100); // completes again after reset — handler must NOT fire again
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("onComplete unsubscribe() prevents handler from firing", () => {
    const s = makeSprite();
    const view = createPixiSpriteAnimator(s.asSprite(), oneShotGraph(), oneShotTextureMap());
    const fn = vi.fn();
    const unsub = view.onComplete(fn);
    unsub();
    view.update(100);
    expect(fn).not.toHaveBeenCalled();
  });

  it("onStateChange fires with (to, from) on a transition", () => {
    const s = makeSprite();
    const view = createPixiSpriteAnimator(s.asSprite(), oneShotGraph(), oneShotTextureMap());
    const fn = vi.fn();
    view.onStateChange(fn);
    view.fireTrigger("done");
    view.update(0); // hit → idle
    expect(fn).toHaveBeenCalledWith("idle", "hit");
  });

  it("onStateChange unsubscribe() stops further notifications", () => {
    const s = makeSprite();
    const view = createPixiSpriteAnimator(s.asSprite(), oneShotGraph(), oneShotTextureMap());
    const fn = vi.fn();
    const unsub = view.onStateChange(fn);
    unsub();
    view.fireTrigger("done");
    view.update(0);
    expect(fn).not.toHaveBeenCalled();
  });
});
