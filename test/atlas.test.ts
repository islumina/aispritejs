import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  InvalidAtlasError,
  type SpriteControl,
  loadAtlas,
  parseAtlas,
} from "../src/atlas/index.js";
import { InvalidGraphError, type SpriteGraph } from "../src/index.js";

// The real PixiJS-v8 atlas emitted by the family sprite pipeline. It carries a
// FOREIGN event-driven `states` block ({ initial, definitions } keyed by events
// like MOVE_DOWN / ATTACK) that aispritejs must ignore.
const reimuAtlas = JSON.parse(
  readFileSync(new URL("./fixtures/reimu-atlas.json", import.meta.url), "utf8"),
) as { animations: Record<string, string[]>; states: { definitions: unknown } };

// An input-driven control to drive the real atlas's frames/animations.
const reimuControl: SpriteControl = {
  inputs: {
    moving: { type: "boolean", default: false },
    attack: { type: "trigger" },
  },
  states: {
    idle_front: { animation: "idle_front", loop: true },
    walk_front: { animation: "walk_front", loop: true },
    attack_front: { animation: "attack_front", loop: false, onEnd: "idle_front" },
  },
  transitions: [
    { from: "*", to: "attack_front", when: [{ input: "attack", op: "Trigger" }], priority: 10 },
    {
      from: "idle_front",
      to: "walk_front",
      when: [{ input: "moving", op: "Equals", value: true }],
    },
    {
      from: "walk_front",
      to: "idle_front",
      when: [{ input: "moving", op: "Equals", value: false }],
    },
  ],
  initial: "idle_front",
};

// A self-contained augmented atlas (README "Data format" shape).
function augmentedAtlas(): Record<string, unknown> {
  return {
    meta: { image: "sheet.png" },
    animations: { idle: ["idle_0", "idle_1"], walk: ["walk_0"] },
    frames: { idle_0: { duration: 120 }, idle_1: { duration: 120 }, walk_0: { duration: 80 } },
    inputs: { speed: { type: "number", default: 0 } },
    states: { idle: { animation: "idle", loop: true }, walk: { animation: "walk", loop: true } },
    transitions: [
      { from: "idle", to: "walk", when: [{ input: "speed", op: "GreaterThan", value: 0 }] },
    ],
    initial: "idle",
    defaultFrameDuration: 100,
  };
}

describe("parseAtlas — augmented atlas (no control)", () => {
  it("reads inputs/states/transitions and frame timing from the atlas itself", () => {
    const graph = parseAtlas(augmentedAtlas());
    expect(Object.keys(graph.animations)).toEqual(["idle", "walk"]);
    expect(graph.frames?.idle_0?.duration).toBe(120);
    expect(graph.initial).toBe("idle");
    expect(graph.defaultFrameDuration).toBe(100);
    expect(graph.transitions).toHaveLength(1);
  });

  it("loads into a working animator", () => {
    const a = loadAtlas(augmentedAtlas());
    expect(a.activeState).toBe("idle");
    a.setInput("speed", 3);
    a.update(0);
    expect(a.activeState).toBe("walk");
  });

  it("omits initial/defaultFrameDuration/frames when the atlas omits them", () => {
    const graph = parseAtlas({
      animations: { idle: ["idle_0"] },
      inputs: {},
      states: { idle: { animation: "idle" } },
      transitions: [],
    });
    expect(graph.initial).toBeUndefined();
    expect(graph.defaultFrameDuration).toBeUndefined();
    expect(graph.frames).toBeUndefined();
  });
});

describe("parseAtlas — real PixiJS atlas + control (ignores foreign states)", () => {
  it("uses the supplied control, not the atlas's event-driven states", () => {
    const graph = parseAtlas(reimuAtlas, reimuControl);
    // animations/frames come from the atlas...
    expect(graph.animations.idle_front).toEqual(reimuAtlas.animations.idle_front);
    expect(graph.frames).toBeDefined();
    // ...but the input-driven graph is the control, NOT the foreign block.
    expect(graph.transitions).toBe(reimuControl.transitions);
    expect(graph.states).toBe(reimuControl.states);
  });

  it("drives real frames through input transitions and onEnd, honouring atlas durations", () => {
    const a = loadAtlas(reimuAtlas, reimuControl);
    const anims = reimuAtlas.animations;
    expect(a.activeState).toBe("idle_front");
    expect(a.activeFrameKey).toBe(anims.idle_front![0]);

    a.setInput("moving", true);
    a.update(0);
    expect(a.activeState).toBe("walk_front");
    expect(anims.walk_front).toContain(a.activeFrameKey);

    a.fireTrigger("attack");
    a.update(0);
    expect(a.activeState).toBe("attack_front");
    expect(a.activeFrameKey).toBe(anims.attack_front![0]);

    // attack_front is non-looping; real frames are 100 ms each → advance past
    // its total to complete and auto-return to idle_front via onEnd.
    a.update(anims.attack_front!.length * 100 + 1);
    expect(a.activeState).toBe("idle_front");
  });

  it("throws without a control because the atlas's states are event-driven", () => {
    expect(() => parseAtlas(reimuAtlas)).toThrow(InvalidAtlasError);
  });
});

describe("parseAtlas — structural validation", () => {
  it("rejects a non-object atlas", () => {
    expect(() => parseAtlas(null)).toThrow(InvalidAtlasError);
    expect(() => parseAtlas("nope")).toThrow(InvalidAtlasError);
  });

  it("rejects malformed animations", () => {
    expect(() => parseAtlas({ animations: 5 }, reimuControl)).toThrow(InvalidAtlasError);
    expect(() => parseAtlas({ animations: { idle: "x" } }, reimuControl)).toThrow(
      InvalidAtlasError,
    );
    expect(() => parseAtlas({ animations: { idle: [1, 2] } }, reimuControl)).toThrow(
      InvalidAtlasError,
    );
  });

  it("rejects a non-object frames block", () => {
    expect(() => parseAtlas({ animations: { idle: ["i0"] }, frames: 5 }, reimuControl)).toThrow(
      InvalidAtlasError,
    );
  });

  it("throws when there is no aispritejs control block and none supplied", () => {
    expect(() => parseAtlas({ animations: { idle: ["i0"] } })).toThrow(InvalidAtlasError);
  });

  it("treats a non-object `definitions` as not-foreign and still asks for a control", () => {
    // states has a string `initial` but a non-object `definitions` → not the
    // foreign wrapper; with no usable control block it still throws.
    expect(() =>
      parseAtlas({ animations: { idle: ["i0"] }, states: { initial: "idle", definitions: 5 } }),
    ).toThrow(InvalidAtlasError);
  });

  it("parses with a control even when the atlas has no frames", () => {
    const control: SpriteControl = {
      inputs: {},
      states: { idle: { animation: "idle" } },
      transitions: [],
      initial: "idle",
    };
    const graph: SpriteGraph = parseAtlas({ animations: { idle: ["i0"] } }, control);
    expect(graph.frames).toBeUndefined();
    expect(graph.states).toBe(control.states);
  });

  it("rejects a frames block whose entry is not an object (F-3 hardening)", () => {
    // frames:{x:null} must throw InvalidAtlasError before reaching the core.
    expect(() =>
      parseAtlas({ animations: { idle: ["i0"] }, frames: { i0: null } }, reimuControl),
    ).toThrow(InvalidAtlasError);
    expect(() =>
      parseAtlas({ animations: { idle: ["i0"] }, frames: { i0: "bad" } }, reimuControl),
    ).toThrow(InvalidAtlasError);
  });

  it("rejects a transitions array whose entry is not an object (F-5 hardening)", () => {
    // transitions:[null] must throw InvalidAtlasError before the core sees it.
    expect(() =>
      parseAtlas({
        animations: { idle: ["i0"] },
        inputs: {},
        states: { idle: { animation: "idle" } },
        transitions: [null],
      }),
    ).toThrow(InvalidAtlasError);
  });

  // SPR-S-02: a null (or non-object) item inside a `when` array causes a bare
  // TypeError at compile.ts:159-160. The parser must validate each `when` item
  // is an object and throw InvalidAtlasError (not TypeError) before the core.
  it("rejects a transition whose `when` array contains a null entry (SPR-S-02)", () => {
    // The fix should throw InvalidAtlasError, not a bare TypeError.
    expect(() =>
      parseAtlas({
        animations: { idle: ["i0"] },
        inputs: { speed: { type: "number", default: 0 } },
        states: { idle: { animation: "idle", loop: true } },
        transitions: [
          {
            from: "idle",
            to: "idle",
            when: [null], // hostile: null condition item
          },
        ],
      }),
    ).toThrow(InvalidAtlasError);
    // Non-object (e.g. string) item in `when` is also rejected.
    expect(() =>
      parseAtlas({
        animations: { idle: ["i0"] },
        inputs: { speed: { type: "number", default: 0 } },
        states: { idle: { animation: "idle", loop: true } },
        transitions: [
          {
            from: "idle",
            to: "idle",
            when: ["bad"], // hostile: string condition item
          },
        ],
      }),
    ).toThrow(InvalidAtlasError);
  });

  it("rejects an inputs entry that is not an object", () => {
    // inputs:{speed:null} must throw InvalidAtlasError with accurate type name.
    expect(() =>
      parseAtlas({
        animations: { idle: ["i0"] },
        inputs: { speed: null },
        states: { idle: { animation: "idle" } },
        transitions: [],
      }),
    ).toThrow(new InvalidAtlasError('input entry "speed" must be an object, got null'));
    expect(() =>
      parseAtlas({
        animations: { idle: ["i0"] },
        inputs: { speed: [1, 2] },
        states: { idle: { animation: "idle" } },
        transitions: [],
      }),
    ).toThrow(new InvalidAtlasError('input entry "speed" must be an object, got array'));
  });

  it("rejects a states entry that is not an object", () => {
    // states:{idle:null} must throw InvalidAtlasError with accurate type name.
    expect(() =>
      parseAtlas({
        animations: { idle: ["i0"] },
        inputs: {},
        states: { idle: null },
        transitions: [],
      }),
    ).toThrow(new InvalidAtlasError('state entry "idle" must be an object, got null'));
    expect(() =>
      parseAtlas({
        animations: { idle: ["i0"] },
        inputs: {},
        states: { idle: "bad" },
        transitions: [],
      }),
    ).toThrow(new InvalidAtlasError('state entry "idle" must be an object, got string'));
  });
});

describe("loadAtlas — semantic validation", () => {
  it("surfaces InvalidGraphError for a semantically invalid graph", () => {
    const control: SpriteControl = {
      inputs: {},
      states: { idle: { animation: "idle" } },
      transitions: [{ from: "idle", to: "ghost" }], // unknown target
      initial: "idle",
    };
    expect(() => loadAtlas({ animations: { idle: ["i0"] } }, control)).toThrow(InvalidGraphError);
  });
});

// B10: atlas wrong-type control fields (PIN current behavior, do NOT change it).
// When `initial` or `defaultFrameDuration` have the wrong type in the atlas JSON,
// the parser leniently ignores the wrong-typed field (it uses a typeof-guard).
// This leniency is intentional and locked: the parser only picks up these fields
// when they are the expected type, silently skipping bad values rather than throwing.
// Any change to this behavior would be a BREAKING CHANGE for lenient atlases in the wild.
describe("parseAtlas — wrong-type control fields (lenient behavior, LOCKED)", () => {
  it("ignores a non-string `initial` and starts at the first declared state", () => {
    // `initial: 42` is a number, not a string → ignored by the typeof guard.
    // The graph defaults to the first declared state ("idle").
    const graph = parseAtlas({
      animations: { idle: ["i0"], walk: ["w0"] },
      inputs: {},
      states: { idle: { animation: "idle" }, walk: { animation: "walk" } },
      transitions: [],
      initial: 42, // wrong type: number instead of string
    });
    // Wrong-typed `initial` is ignored → defaults to first declared state.
    expect(graph.initial).toBeUndefined(); // parseAtlas does not forward it
    // Confirm the animator starts at the first declared state.
    const a = loadAtlas({
      animations: { idle: ["i0"], walk: ["w0"] },
      inputs: {},
      states: { idle: { animation: "idle" }, walk: { animation: "walk" } },
      transitions: [],
      initial: 42,
    });
    expect(a.activeState).toBe("idle"); // first declared state
  });

  it("ignores a non-number `defaultFrameDuration` and uses the runtime default (100ms)", () => {
    // `defaultFrameDuration: "fast"` is a string, not a number → ignored.
    // The runtime fallback is 100ms.
    const graph = parseAtlas({
      animations: { idle: ["i0"] },
      inputs: {},
      states: { idle: { animation: "idle", loop: true } },
      transitions: [],
      defaultFrameDuration: "fast", // wrong type: string instead of number
    });
    // Wrong-typed field is not forwarded.
    expect(graph.defaultFrameDuration).toBeUndefined();
    // Confirm the animator uses the 100ms runtime default.
    const a = loadAtlas({
      animations: { idle: ["i0"] },
      inputs: {},
      states: { idle: { animation: "idle", loop: true } },
      transitions: [],
      defaultFrameDuration: "fast",
    });
    // idle_0 at 100ms default: after 100ms elapsed the frame wraps back to 0 in a loop.
    expect(a.activeState).toBe("idle");
    a.update(100);
    expect(a.activeFrameIndex).toBe(0); // single frame loops to 0
  });
});
