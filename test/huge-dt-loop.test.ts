import { describe, expect, it } from "vitest";
import { createSpriteAnimator } from "../src/index.js";

describe("looping clip after one huge finite dt", () => {
  const graph = {
    animations: { walk: ["w0", "w1", "w2", "w3"] },
    inputs: {},
    states: { walk: { animation: "walk", loop: true } },
    transitions: [],
  } as const;

  it("keeps animating on later 100 ms ticks (1e300 ms glitch)", () => {
    const a = createSpriteAnimator(graph);
    a.update(1e300);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      a.update(100);
      seen.add(a.activeFrameKey);
    }
    expect(seen.size).toBe(4);
  });

  it("keeps animating after a 1e18 ms glitch (e.g. ns timestamp passed as dt)", () => {
    const a = createSpriteAnimator(graph);
    a.update(1e18);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      a.update(16);
      seen.add(a.activeFrameKey);
    }
    expect(seen.size).toBe(4);
  });
});
