import { describe, expect, it } from "vitest";
import { createSpriteAnimator, InvalidGraphError } from "../src/index.js";

describe("default initial state with an integer-like state name", () => {
  // JSON.parse keeps the authored order in the text, but JS enumerates
  // integer-like keys ("1") before every other key, so `states` iterates
  // "1" first even though "idle" was declared first.
  const graph = () =>
    JSON.parse(`{
      "animations": { "idle": ["i0"], "lvl": ["l0"] },
      "inputs": {},
      "states": { "idle": { "animation": "idle", "loop": true }, "1": { "animation": "lvl", "loop": true } },
      "transitions": []
    }`);

  it("requires an explicit initial when any state name is integer-like", () => {
    expect(() => createSpriteAnimator(graph())).toThrow(InvalidGraphError);
  });

  it("an explicit initial is honoured", () => {
    const g = graph();
    g.initial = "idle";
    expect(createSpriteAnimator(g).activeState).toBe("idle");
  });

  it("an explicit integer-like initial is honoured", () => {
    const g = graph();
    g.initial = "1";
    expect(createSpriteAnimator(g).activeState).toBe("1");
  });

  it.each(["01", "-1", "1.5", "4294967295"])(
    "a non-index numeric-looking name (%s) keeps declaration order",
    (name) => {
      const a = createSpriteAnimator({
        animations: { idle: ["i0"] },
        inputs: {},
        states: { idle: { animation: "idle" }, [name]: { animation: "idle" } },
        transitions: [],
      });
      expect(a.activeState).toBe("idle");
    },
  );
});
