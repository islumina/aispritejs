import type { Sprite, Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import { createSpriteAnimator, InvalidGraphError } from "../src/index.js";
import { createPixiSpriteAnimator } from "../src/pixi/index.js";

const mk = (frames: unknown) =>
  JSON.parse(
    JSON.stringify({
      animations: { idle: frames },
      frames: { a: { duration: 500 } },
      inputs: {},
      states: { idle: { animation: "idle", loop: true } },
      transitions: [],
    }),
  );

const lists: [unknown][] = [[[null]], [[42]], [[["a"]]], [[{ k: 1 }]]];

describe("non-string frame keys in the core", () => {
  it.each(lists)("rejects frame list %j", (frames) => {
    expect(() => createSpriteAnimator(mk(frames))).toThrow(InvalidGraphError);
  });

  it("rejects a hole in a frame list built from untyped JS", () => {
    const g = mk(["a"]);
    g.animations.idle = new Array(1); // [<1 empty item>]: `some` / `every` would skip it
    expect(() => createSpriteAnimator(g)).toThrow('animation "idle" frame keys must be strings');
  });
});

describe("non-string frame keys in the Pixi adapter", () => {
  it.each(lists)("rejects frame list %j before binding", (frames) => {
    // Every stringified form has a texture, so only the key-type check can
    // reject the graph (before this check `["a"]` silently bound texture "a").
    const tex = {} as Texture;
    const textures = { a: tex, null: tex, "42": tex, "[object Object]": tex };
    let writes = 0;
    const sprite = {
      anchor: { set() {} },
      set texture(_t: Texture) {
        writes++;
      },
    } as unknown as Sprite;
    expect(() => createPixiSpriteAnimator(sprite, mk(frames), textures)).toThrow(InvalidGraphError);
    expect(writes).toBe(0);
  });
});
