import { describe, expect, it } from "vitest";
import {
  createSpriteAnimator,
  InputTypeError,
  type SpriteGraph,
  UnknownInputError,
} from "../src/index.js";

function graph(): SpriteGraph {
  return {
    animations: { idle: ["i0"] },
    inputs: {
      speed: { type: "number", default: 0 },
      grounded: { type: "boolean", default: true },
      jump: { type: "trigger" },
    },
    states: { idle: { animation: "idle" } },
    transitions: [],
    initial: "idle",
  };
}

describe("setInput", () => {
  it("accepts a matching number or boolean", () => {
    const a = createSpriteAnimator(graph());
    expect(() => a.setInput("speed", 4)).not.toThrow();
    expect(() => a.setInput("grounded", false)).not.toThrow();
  });

  it("throws UnknownInputError for an undeclared input", () => {
    const a = createSpriteAnimator(graph());
    expect(() => a.setInput("ghost", 1)).toThrow(UnknownInputError);
  });

  it("throws InputTypeError for a kind mismatch", () => {
    const a = createSpriteAnimator(graph());
    expect(() => a.setInput("speed", true)).toThrow(InputTypeError);
    expect(() => a.setInput("grounded", 1)).toThrow(InputTypeError);
  });

  it("throws InputTypeError on NaN", () => {
    const a = createSpriteAnimator(graph());
    expect(() => a.setInput("speed", Number.NaN)).toThrow(InputTypeError);
  });

  it("throws InputTypeError when targeting a Trigger", () => {
    const a = createSpriteAnimator(graph());
    expect(() => a.setInput("jump", 1)).toThrow(InputTypeError);
  });
});

describe("fireTrigger", () => {
  it("accepts a declared trigger", () => {
    const a = createSpriteAnimator(graph());
    expect(() => a.fireTrigger("jump")).not.toThrow();
  });

  it("throws UnknownInputError for an undeclared input", () => {
    const a = createSpriteAnimator(graph());
    expect(() => a.fireTrigger("ghost")).toThrow(UnknownInputError);
  });

  it("throws InputTypeError for a non-trigger input", () => {
    const a = createSpriteAnimator(graph());
    expect(() => a.fireTrigger("speed")).toThrow(InputTypeError);
  });

  it("exposes the offending input name on the error", () => {
    const a = createSpriteAnimator(graph());
    try {
      a.fireTrigger("speed");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InputTypeError);
      expect((err as InputTypeError).input).toBe("speed");
    }
  });
});
