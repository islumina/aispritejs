import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InvalidGraphError, type SpriteGraph, createSpriteAnimator } from "../src/index.js";

/** The slice of JSON Schema these tests walk. */
interface SchemaNode {
  readonly type?: string | readonly string[];
  readonly enum?: readonly unknown[];
  readonly properties?: Readonly<Record<string, SchemaNode>>;
  readonly items?: SchemaNode;
  readonly additionalProperties?: SchemaNode;
}

// Build a minimal valid graph, then override one field per case to isolate the
// failure. Malformed-shape cases (bad operator / input type) use a cast since
// the type system would otherwise reject them at author time.
function base(): SpriteGraph {
  return {
    animations: { idle: ["i0"] },
    inputs: { n: { type: "number" }, b: { type: "boolean" }, t: { type: "trigger" } },
    states: { idle: { animation: "idle" } },
    transitions: [],
    initial: "idle",
  };
}

const expectInvalid = (graph: unknown) =>
  expect(() => createSpriteAnimator(graph as SpriteGraph)).toThrow(InvalidGraphError);

describe("graph validation", () => {
  it("rejects an empty states block", () => {
    expectInvalid({ ...base(), states: {} });
  });

  it("rejects an unknown input type", () => {
    expectInvalid({ ...base(), inputs: { bad: { type: "color" } } });
  });

  it("rejects a non-positive defaultFrameDuration", () => {
    expectInvalid({ ...base(), defaultFrameDuration: 0 });
  });

  it("rejects an infinite defaultFrameDuration", () => {
    expect(() =>
      createSpriteAnimator({ ...base(), defaultFrameDuration: Number.POSITIVE_INFINITY }),
    ).toThrow(
      new InvalidGraphError("defaultFrameDuration must be a finite number > 0, got Infinity"),
    );
  });

  it("rejects a non-positive frame duration", () => {
    expectInvalid({ ...base(), frames: { i0: { duration: -5 } } });
  });

  it("rejects an infinite frame duration", () => {
    expect(() =>
      createSpriteAnimator({ ...base(), frames: { i0: { duration: Number.POSITIVE_INFINITY } } }),
    ).toThrow(
      new InvalidGraphError(`frame "i0" duration must be a finite number > 0, got Infinity`),
    );
  });

  it("rejects an unknown initial state", () => {
    expectInvalid({ ...base(), initial: "ghost" });
  });

  it("rejects a state referencing an unknown animation", () => {
    expectInvalid({ ...base(), states: { idle: { animation: "missing" } } });
  });

  it("rejects an empty animation frame list", () => {
    expectInvalid({ ...base(), animations: { idle: [] } });
  });

  it("rejects a non-positive state speed", () => {
    expectInvalid({ ...base(), states: { idle: { animation: "idle", speed: 0 } } });
  });

  it("rejects an infinite state speed", () => {
    expect(() =>
      createSpriteAnimator({
        ...base(),
        states: { idle: { animation: "idle", speed: Number.POSITIVE_INFINITY } },
      }),
    ).toThrow(
      new InvalidGraphError(`state "idle" speed must be a finite number > 0, got Infinity`),
    );
  });

  it("rejects onEnd combined with loop:true", () => {
    expectInvalid({
      ...base(),
      states: { idle: { animation: "idle", loop: true, onEnd: "idle" } },
    });
  });

  it("rejects an onEnd target that is not declared", () => {
    expectInvalid({
      ...base(),
      states: { idle: { animation: "idle", loop: false, onEnd: "ghost" } },
    });
  });

  it("rejects a transition from an unknown state", () => {
    expectInvalid({ ...base(), transitions: [{ from: "ghost", to: "idle" }] });
  });

  it("rejects a transition to an unknown state", () => {
    expectInvalid({ ...base(), transitions: [{ from: "idle", to: "ghost" }] });
  });

  it("rejects a condition on an unknown input", () => {
    expectInvalid({
      ...base(),
      transitions: [{ from: "idle", to: "idle", when: [{ input: "ghost", op: "Trigger" }] }],
    });
  });

  it("rejects a Trigger op on a non-trigger input", () => {
    expectInvalid({
      ...base(),
      transitions: [{ from: "idle", to: "idle", when: [{ input: "n", op: "Trigger" }] }],
    });
  });

  it("rejects a Trigger condition carrying a value", () => {
    expectInvalid({
      ...base(),
      transitions: [{ from: "idle", to: "idle", when: [{ input: "t", op: "Trigger", value: 1 }] }],
    });
  });

  it("rejects GreaterThan / LessThan on a non-number input", () => {
    expectInvalid({
      ...base(),
      transitions: [
        { from: "idle", to: "idle", when: [{ input: "b", op: "GreaterThan", value: 1 }] },
      ],
    });
  });

  it("rejects GreaterThan without a numeric value", () => {
    expectInvalid({
      ...base(),
      transitions: [{ from: "idle", to: "idle", when: [{ input: "n", op: "GreaterThan" }] }],
    });
  });

  it("rejects Equals / NotEquals on a trigger input", () => {
    expectInvalid({
      ...base(),
      transitions: [{ from: "idle", to: "idle", when: [{ input: "t", op: "Equals", value: 1 }] }],
    });
  });

  it("rejects Equals on a number input without a numeric value", () => {
    expectInvalid({
      ...base(),
      transitions: [
        { from: "idle", to: "idle", when: [{ input: "n", op: "Equals", value: true }] },
      ],
    });
  });

  it("rejects Equals on a boolean input without a boolean value", () => {
    expectInvalid({
      ...base(),
      transitions: [{ from: "idle", to: "idle", when: [{ input: "b", op: "Equals", value: 1 }] }],
    });
  });

  it("rejects an unknown operator", () => {
    expectInvalid({
      ...base(),
      transitions: [{ from: "idle", to: "idle", when: [{ input: "n", op: "Between", value: 1 }] }],
    });
  });

  it("rejects an array transition entry (direct compileGraph hardening)", () => {
    expectInvalid({
      ...base(),
      transitions: [[] as unknown as { from: string; to: string }],
    });
    expect(() =>
      createSpriteAnimator({
        ...base(),
        transitions: [[] as unknown as { from: string; to: string }],
      }),
    ).toThrow(new InvalidGraphError("transition #0 must be an object"));
  });

  it("rejects a non-object frame timing entry (direct compileGraph hardening)", () => {
    expectInvalid({
      ...base(),
      frames: { i0: null as unknown as { duration?: number } },
    });
    expect(() =>
      createSpriteAnimator({
        ...base(),
        frames: { i0: null as unknown as { duration?: number } },
      }),
    ).toThrow(new InvalidGraphError(`frame "i0" timing must be an object`));
  });

  it("rejects a null transition entry (direct compileGraph hardening)", () => {
    expectInvalid({
      ...base(),
      transitions: [null as unknown as { from: string; to: string }],
    });
    expect(() =>
      createSpriteAnimator({
        ...base(),
        transitions: [null as unknown as { from: string; to: string }],
      }),
    ).toThrow(new InvalidGraphError("transition #0 must be an object"));
  });

  it("rejects a non-array `when` on a transition (direct compileGraph hardening)", () => {
    expectInvalid({
      ...base(),
      transitions: [{ from: "idle", to: "idle", when: {} as unknown as never[] }],
    });
    expect(() =>
      createSpriteAnimator({
        ...base(),
        transitions: [{ from: "idle", to: "idle", when: {} as unknown as never[] }],
      }),
    ).toThrow(new InvalidGraphError(`transition #0 "when" must be an array`));
  });

  it("accepts a valid graph with all operator kinds", () => {
    expect(() =>
      createSpriteAnimator({
        ...base(),
        transitions: [
          { from: "idle", to: "idle", when: [{ input: "n", op: "GreaterThan", value: 1 }] },
          { from: "idle", to: "idle", when: [{ input: "b", op: "NotEquals", value: false }] },
          { from: "*", to: "idle", when: [{ input: "t", op: "Trigger" }] },
        ],
      }),
    ).not.toThrow();
  });

  // B8: NotEquals validation variants (compile errors).
  it("rejects NotEquals on a trigger input", () => {
    expectInvalid({
      ...base(),
      transitions: [
        { from: "idle", to: "idle", when: [{ input: "t", op: "NotEquals", value: 1 }] },
      ],
    });
  });

  it("rejects NotEquals on a number input with a non-numeric value", () => {
    expectInvalid({
      ...base(),
      transitions: [
        { from: "idle", to: "idle", when: [{ input: "n", op: "NotEquals", value: true }] },
      ],
    });
  });

  it("rejects NotEquals on a boolean input with a non-boolean value", () => {
    expectInvalid({
      ...base(),
      transitions: [
        { from: "idle", to: "idle", when: [{ input: "b", op: "NotEquals", value: 1 }] },
      ],
    });
  });

  // Prototype-key hardening: Object.prototype names must never be accepted as
  // valid state, animation, or input references — they are not own properties.
  it("rejects a prototype-key initial state (Object.hasOwn hardening)", () => {
    expectInvalid({ ...base(), initial: "toString" });
  });

  it("rejects a state referencing a prototype-key animation (Object.hasOwn hardening)", () => {
    expectInvalid({
      ...base(),
      states: { idle: { animation: "constructor" } },
    });
  });

  it("rejects a transition condition on a prototype-key input name (Object.hasOwn hardening)", () => {
    expectInvalid({
      ...base(),
      transitions: [
        { from: "idle", to: "idle", when: [{ input: "hasOwnProperty", op: "Trigger" }] },
      ],
    });
  });

  // SPR-S-03: a `default` whose typeof mismatches the declared input kind must
  // throw InvalidGraphError, not be silently adopted into the input store where
  // it would cause wrong frame selection without any error.
  it('rejects a number input with a string default ("5" is not a number) (SPR-S-03)', () => {
    expect(() =>
      createSpriteAnimator({
        ...base(),
        inputs: { speed: { type: "number", default: "5" as unknown as number } },
      }),
    ).toThrow(InvalidGraphError);
  });

  it("rejects a boolean input with a number default (1 is not a boolean) (SPR-S-03)", () => {
    expect(() =>
      createSpriteAnimator({
        ...base(),
        inputs: { grounded: { type: "boolean", default: 1 as unknown as boolean } },
      }),
    ).toThrow(InvalidGraphError);
  });

  it("accepts a number input with a valid numeric default (not affected by SPR-S-03 fix)", () => {
    expect(() =>
      createSpriteAnimator({
        ...base(),
        inputs: { speed: { type: "number", default: 5 } },
      }),
    ).not.toThrow();
  });

  it("accepts a boolean input with a valid boolean default (not affected by SPR-S-03 fix)", () => {
    expect(() =>
      createSpriteAnimator({
        ...base(),
        inputs: { grounded: { type: "boolean", default: true } },
      }),
    ).not.toThrow();
  });
});

// Schema hardening: minProperties on animations and finite numeric maximums.
// MAX_DURATION = 86_400_000 ms (24 h) for duration/defaultFrameDuration.
// MAX_SPEED    = 1_000 for state speed multiplier.
describe("schema hardening — minProperties + finite maximums", () => {
  // (a) empty animations object must be rejected with a dedicated message
  it("rejects an empty animations map with 'at least one animation' message (minProperties: 1)", () => {
    expect(() =>
      createSpriteAnimator({
        ...base(),
        animations: {},
        states: { idle: { animation: "idle" } },
      }),
    ).toThrow(new InvalidGraphError("animations must declare at least one animation"));
  });

  // (b) duration maximum
  it("rejects a frame duration above the 24-hour ceiling (MAX_DURATION)", () => {
    expect(() =>
      createSpriteAnimator({ ...base(), frames: { i0: { duration: 86_400_001 } } }),
    ).toThrow(InvalidGraphError);
  });

  it("accepts a frame duration at the 24-hour ceiling (MAX_DURATION)", () => {
    expect(() =>
      createSpriteAnimator({ ...base(), frames: { i0: { duration: 86_400_000 } } }),
    ).not.toThrow();
  });

  // (b) defaultFrameDuration maximum
  it("rejects defaultFrameDuration above the 24-hour ceiling (MAX_DURATION)", () => {
    expect(() => createSpriteAnimator({ ...base(), defaultFrameDuration: 86_400_001 })).toThrow(
      InvalidGraphError,
    );
  });

  it("accepts defaultFrameDuration at the 24-hour ceiling (MAX_DURATION)", () => {
    expect(() =>
      createSpriteAnimator({ ...base(), defaultFrameDuration: 86_400_000 }),
    ).not.toThrow();
  });

  // (b) speed maximum
  it("rejects a state speed above 1000× (MAX_SPEED)", () => {
    expect(() =>
      createSpriteAnimator({
        ...base(),
        states: { idle: { animation: "idle", speed: 1000.001 } },
      }),
    ).toThrow(InvalidGraphError);
  });

  it("accepts a state speed at 1000× (MAX_SPEED)", () => {
    expect(() =>
      createSpriteAnimator({
        ...base(),
        states: { idle: { animation: "idle", speed: 1000 } },
      }),
    ).not.toThrow();
  });
});

// P1: every identifier the compiler resolves through `Object.hasOwn` must be a
// string (hasOwn would stringify 0 or ["idle"] into a declared name). Each case
// also pins that the JSON Schema declares the same field as a string, so code
// and schema cannot drift apart.
describe("identifier types (P1) — code and schema in sync", () => {
  const schema = JSON.parse(
    readFileSync(new URL("../schemas/aispritejs-graph.schema.json", import.meta.url), "utf8"),
  ) as SchemaNode;
  const transition = schema.properties!.transitions!.items!;
  const condition = transition.properties!.when!.items!;
  const schemaFields: Record<string, SchemaNode> = {
    initial: schema.properties!.initial!,
    animation: schema.properties!.states!.additionalProperties!.properties!.animation!,
    onEnd: schema.properties!.states!.additionalProperties!.properties!.onEnd!,
    from: transition.properties!.from!,
    to: transition.properties!.to!,
    input: condition.properties!.input!,
    op: condition.properties!.op!,
  };

  const cases: ReadonlyArray<[field: string, graph: () => unknown, message: RegExp]> = [
    ["initial", () => ({ ...base(), initial: 0 }), /initial must be a string, got number/],
    [
      "animation",
      () => ({ ...base(), animations: { "1": ["i0"] }, states: { idle: { animation: 1 } } }),
      /state "idle" animation must be a string, got number/,
    ],
    [
      "onEnd",
      () => ({ ...base(), states: { idle: { animation: "idle", onEnd: ["idle"] } } }),
      /state "idle" onEnd must be a string, got object/,
    ],
    [
      "from",
      () => ({ ...base(), transitions: [{ from: ["idle"], to: "idle" }] }),
      /transition #0 "from" must be a string, got object/,
    ],
    [
      "to",
      () => ({ ...base(), transitions: [{ from: "idle", to: ["idle"] }] }),
      /transition #0 "to" must be a string, got object/,
    ],
    [
      "input",
      () => ({
        ...base(),
        inputs: { "0": { type: "trigger" } },
        transitions: [{ from: "idle", to: "idle", when: [{ input: 0, op: "Trigger" }] }],
      }),
      /transition #0 condition "input" must be a string, got number/,
    ],
    [
      "op",
      () => ({
        ...base(),
        transitions: [{ from: "idle", to: "idle", when: [{ input: "t", op: ["Trigger"] }] }],
      }),
      /transition #0 condition "op" must be a string, got object/,
    ],
  ];

  for (const [field, graph, message] of cases) {
    it(`rejects a non-string ${field} with InvalidGraphError naming the field`, () => {
      expect(() => createSpriteAnimator(graph() as SpriteGraph)).toThrow(InvalidGraphError);
      expect(() => createSpriteAnimator(graph() as SpriteGraph)).toThrow(message);
      const node = schemaFields[field]!;
      // `op` is an enum of strings rather than a `type`; both mean "string".
      if (node.type !== undefined) expect(node.type).toBe("string");
      else expect(node.enum?.every((v) => typeof v === "string")).toBe(true);
    });
  }

  it("rejects a null state entry and a null condition as a non-string field", () => {
    expect(() =>
      createSpriteAnimator({ ...base(), states: { idle: null } } as unknown as SpriteGraph),
    ).toThrow(/state "idle" animation must be a string, got undefined/);
    expect(() =>
      createSpriteAnimator({
        ...base(),
        transitions: [{ from: "idle", to: "idle", when: [null] }],
      } as unknown as SpriteGraph),
    ).toThrow(/transition #0 condition "input" must be a string, got undefined/);
  });
});

// P3: priority must be an integer (the schema already says so) — NaN or a
// string would make the candidate sort inconsistent and could flip the winner.
describe("transition priority (P3)", () => {
  const withPriority = (priority: unknown) =>
    ({
      ...base(),
      transitions: [{ from: "idle", to: "idle", when: [{ input: "t", op: "Trigger" }], priority }],
    }) as unknown as SpriteGraph;

  it.each([Number.NaN, "1", 1.5, Number.POSITIVE_INFINITY])("rejects priority %s", (p) => {
    expect(() => createSpriteAnimator(withPriority(p))).toThrow(InvalidGraphError);
    expect(() => createSpriteAnimator(withPriority(p))).toThrow(
      /transition #0 priority must be an integer, got /,
    );
  });

  it.each([0, -3, 7])("accepts integer priority %s", (p) => {
    expect(() => createSpriteAnimator(withPriority(p))).not.toThrow();
  });

  it("matches the schema's integer type", () => {
    const schema = JSON.parse(
      readFileSync(new URL("../schemas/aispritejs-graph.schema.json", import.meta.url), "utf8"),
    ) as SchemaNode;
    expect(schema.properties!.transitions!.items!.properties!.priority!.type).toBe("integer");
  });

  it("a negative priority still loses to the default 0", () => {
    const a = createSpriteAnimator({
      animations: { a: ["a0"], lo: ["l0"], hi: ["h0"] },
      inputs: {},
      states: { a: { animation: "a" }, lo: { animation: "lo" }, hi: { animation: "hi" } },
      transitions: [
        { from: "a", to: "lo", priority: -1 },
        { from: "a", to: "hi" },
      ],
      initial: "a",
    });
    a.update(0);
    expect(a.activeState).toBe("hi");
  });
});

// Family argument-validation rule: createSpriteAnimator reports a malformed
// graph from an untyped caller as InvalidGraphError, never a bare TypeError.
describe("graph shape (argument validation)", () => {
  it.each<[string, unknown, RegExp]>([
    ["undefined", undefined, /graph must be an object/],
    ["null", null, /graph must be an object/],
    ["an array", [], /graph must be an object/],
    ["no animations", { ...base(), animations: undefined }, /animations must be an object/],
    ["null inputs", { ...base(), inputs: null }, /inputs must be an object/],
    ["array states", { ...base(), states: [] }, /states must be an object/],
    ["object transitions", { ...base(), transitions: {} }, /transitions must be an array/],
    ["missing transitions", { ...base(), transitions: undefined }, /transitions must be an array/],
    [
      "a non-array animation",
      { ...base(), animations: { idle: ["i0"], other: 5 } },
      /animation "other" must be an array of frame keys/,
    ],
    [
      "a string animation",
      { ...base(), animations: { idle: "i0" } },
      /animation "idle" must be an array of frame keys/,
    ],
    ["a null input entry", { ...base(), inputs: { n: null } }, /input "n" has unknown type/],
  ])("rejects %s with InvalidGraphError", (_label, graph, message) => {
    let thrown: unknown;
    try {
      createSpriteAnimator(graph as SpriteGraph);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(InvalidGraphError);
    expect((thrown as Error).name).toBe("InvalidGraphError");
    expect((thrown as Error).message).toMatch(message);
  });
});
