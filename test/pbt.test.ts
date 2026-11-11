import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createSpriteAnimator } from "../src/index.js";
import { clips, platformer } from "./fixtures/graphs.js";

type Cmd =
  | { readonly kind: "speed"; readonly v: number }
  | { readonly kind: "grounded"; readonly b: boolean }
  | { readonly kind: "jump" }
  | { readonly kind: "update"; readonly dt: number };

const command: fc.Arbitrary<Cmd> = fc.oneof(
  fc.integer({ min: -3, max: 10 }).map((v) => ({ kind: "speed", v }) as const),
  fc.boolean().map((b) => ({ kind: "grounded", b }) as const),
  fc.constant({ kind: "jump" } as const),
  fc.integer({ min: 0, max: 300 }).map((dt) => ({ kind: "update", dt }) as const),
);

// Clip commands for the clips() fixture — includes fireTrigger + update(dt).
type ClipsCmd =
  | { readonly kind: "go"; readonly b: boolean }
  | { readonly kind: "attack" }
  | { readonly kind: "update"; readonly dt: number };

const clipsCommand: fc.Arbitrary<ClipsCmd> = fc.oneof(
  fc.boolean().map((b) => ({ kind: "go", b }) as const),
  fc.constant({ kind: "attack" } as const),
  // Explicitly exclude Infinity/NaN: generator is bounded integer-only.
  fc.integer({ min: 0, max: 300 }).map((dt) => ({ kind: "update", dt }) as const),
);

function trace(cmds: readonly Cmd[]): string[] {
  const a = createSpriteAnimator(platformer());
  const out: string[] = [];
  for (const c of cmds) {
    switch (c.kind) {
      case "speed":
        a.setInput("speed", c.v);
        break;
      case "grounded":
        a.setInput("isGrounded", c.b);
        break;
      case "jump":
        a.fireTrigger("jump");
        break;
      case "update":
        a.update(c.dt);
        break;
    }
    out.push(`${a.activeState}:${a.activeFrameKey}:${a.activeFrameIndex}`);
  }
  return out;
}

function traceClips(cmds: readonly ClipsCmd[]): string[] {
  const a = createSpriteAnimator(clips());
  const out: string[] = [];
  for (const c of cmds) {
    switch (c.kind) {
      case "go":
        a.setInput("go", c.b);
        break;
      case "attack":
        a.fireTrigger("attack");
        break;
      case "update":
        a.update(c.dt);
        break;
    }
    out.push(`${a.activeState}:${a.activeFrameKey}:${a.activeFrameIndex}`);
  }
  return out;
}

describe("property: determinism", () => {
  it("identical command sequences produce identical frame traces (platformer)", () => {
    fc.assert(
      fc.property(fc.array(command, { maxLength: 50 }), (cmds) => {
        expect(trace(cmds)).toEqual(trace(cmds));
      }),
    );
  });

  // A4: extend determinism to clips() fixture with fireTrigger + update(dt).
  // Identical command sequences (including trigger firings and onEnd transitions)
  // must yield identical (activeState, activeFrameKey, activeFrameIndex) traces.
  it("identical command sequences produce identical frame traces (clips/onEnd)", () => {
    fc.assert(
      fc.property(fc.array(clipsCommand, { maxLength: 50 }), (cmds) => {
        expect(traceClips(cmds)).toEqual(traceClips(cmds));
      }),
    );
  });
});

describe("property: trigger consumption", () => {
  it("a single fire enters the trigger state exactly once", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 500 }), { maxLength: 30 }), (dts) => {
        const a = createSpriteAnimator(clips());
        let entries = 0;
        a.onStateChange((to) => {
          if (to === "attack") entries++;
        });
        a.fireTrigger("attack");
        a.update(0);
        for (const dt of dts) a.update(dt);
        // Fired once → entered once; the consumed trigger never re-fires the
        // Any-State transition no matter how time advances afterwards.
        expect(entries).toBe(1);
      }),
    );
  });

  it("a trigger that is never fired never enters its state", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 500 }), { maxLength: 30 }), (dts) => {
        const a = createSpriteAnimator(clips());
        for (const dt of dts) a.update(dt);
        expect(a.activeState).toBe("idle");
      }),
    );
  });

  // A5: trigger consumption strength — state-specific (non-Any-State) trigger transition,
  // and a graph with two triggers where only one is fired (the unfired one stays pending).
  it("state-specific trigger: only the matching state consumes it", () => {
    // `special` is only on b→c (state-specific, not Any-State).
    // Fire it before entering b → it persists until b→c is reached.
    const a = createSpriteAnimator({
      animations: { a: ["a0"], b: ["b0"], c: ["c0"] },
      inputs: { go: { type: "boolean", default: false }, special: { type: "trigger" } },
      states: {
        a: { animation: "a", loop: true },
        b: { animation: "b", loop: true },
        c: { animation: "c", loop: true },
      },
      transitions: [
        { from: "a", to: "b", when: [{ input: "go", op: "Equals", value: true }] },
        { from: "b", to: "c", when: [{ input: "special", op: "Trigger" }] },
      ],
      initial: "a",
    });
    // Fire `special` while in `a` — no consumer in `a`, so it stays pending.
    a.fireTrigger("special");
    a.update(0);
    expect(a.activeState).toBe("a"); // still in a, trigger pending
    // Enter b, which consumes the still-pending trigger in the very next update.
    a.setInput("go", true);
    a.update(0);
    expect(a.activeState).toBe("b");
    a.update(0);
    expect(a.activeState).toBe("c"); // b→c consumed the pending trigger
    // Trigger was consumed; no spurious re-fire.
    a.update(0);
    expect(a.activeState).toBe("c");
  });

  it("two triggers: only the fired one is consumed; the unfired one stays pending", () => {
    // `fire` and `noop` — only `fire` is fired.
    // `fire` drives a→b; `noop` drives a→c (state-specific).
    const a = createSpriteAnimator({
      animations: { a: ["a0"], b: ["b0"], c: ["c0"] },
      inputs: { fire: { type: "trigger" }, noop: { type: "trigger" } },
      states: {
        a: { animation: "a", loop: true },
        b: { animation: "b", loop: true },
        c: { animation: "c", loop: true },
      },
      transitions: [
        { from: "*", to: "b", when: [{ input: "fire", op: "Trigger" }], priority: 10 },
        { from: "b", to: "c", when: [{ input: "noop", op: "Trigger" }] },
      ],
      initial: "a",
    });
    a.fireTrigger("fire");
    a.update(0);
    expect(a.activeState).toBe("b"); // `fire` consumed
    // `noop` was never fired → b→c does not trigger.
    a.update(0);
    expect(a.activeState).toBe("b");
    // Firing `noop` now moves to c.
    a.fireTrigger("noop");
    a.update(0);
    expect(a.activeState).toBe("c");
  });
});

// A1: Looping-frame bounds & formula.
// For a looping clip with n frames of uniform duration d and finite positive speed,
// over any sequence of finite, non-negative dt values (explicitly exclude Infinity/NaN),
// activeFrameIndex is always in [0, n-1] AND equals floor((accumulatedElapsed % total) / d).
describe("property: looping-frame bounds and formula", () => {
  it("activeFrameIndex stays in [0,n-1] and matches floor((elapsed%total)/d)", () => {
    // walk has 4 uniform frames of 100ms each; total=400ms; speed=1.
    // We drive a standalone looping clip (no transitions to worry about).
    const n = 4;
    const d = 100;
    const total = n * d;
    fc.assert(
      // Generator: array of finite, non-negative integers — explicitly excludes Infinity/NaN.
      fc.property(fc.array(fc.integer({ min: 0, max: 2000 }), { maxLength: 60 }), (dts) => {
        const a = createSpriteAnimator({
          animations: { loop: ["f0", "f1", "f2", "f3"] },
          frames: {
            f0: { duration: d },
            f1: { duration: d },
            f2: { duration: d },
            f3: { duration: d },
          },
          inputs: {},
          states: { loop: { animation: "loop", loop: true } },
          transitions: [],
          initial: "loop",
        });
        let accumulated = 0;
        for (const dt of dts) {
          a.update(dt);
          // speed=1; dt is integer so no floating-point accumulation issues here.
          accumulated += dt;
          const idx = a.activeFrameIndex;
          // Bounds check.
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThanOrEqual(n - 1);
          // Formula check: floor((accumulatedElapsed % total) / d).
          const expected = Math.floor((accumulated % total) / d);
          expect(idx).toBe(expected);
        }
      }),
    );
  });
});

// A2: onComplete exactly once.
// Non-looping clip, graph with no transitions; over any partition of a total time T >= total
// into M chunks, onComplete fires exactly once and the final activeFrameIndex === n-1.
describe("property: onComplete exactly once", () => {
  it("fires onComplete exactly once no matter how time is partitioned (T >= total)", () => {
    // 3-frame attack, each 100ms → total=300ms.
    const frameDuration = 100;
    const frameCount = 3;
    const clipTotal = frameDuration * frameCount;
    fc.assert(
      fc.property(
        // Generate a sequence of finite non-negative dt values whose sum is >= total.
        // Strategy: generate 1..20 chunks each 0..400ms, ensure sum >= clipTotal by
        // appending a guaranteed-completing final chunk.
        fc
          .array(fc.integer({ min: 0, max: 400 }), { minLength: 1, maxLength: 20 })
          .map((chunks) => {
            // Append a chunk large enough to guarantee total sum >= clipTotal.
            const sum = chunks.reduce((s, v) => s + v, 0);
            if (sum < clipTotal) return [...chunks, clipTotal - sum];
            return chunks;
          }),
        (chunks) => {
          const a = createSpriteAnimator({
            animations: { attack: ["a0", "a1", "a2"] },
            frames: {
              a0: { duration: frameDuration },
              a1: { duration: frameDuration },
              a2: { duration: frameDuration },
            },
            inputs: {},
            states: { attack: { animation: "attack", loop: false } },
            transitions: [],
            initial: "attack",
          });
          let fireCount = 0;
          a.onComplete(() => {
            fireCount++;
          });
          for (const dt of chunks) a.update(dt);
          // Must have fired exactly once.
          expect(fireCount).toBe(1);
          // Final frame must be the last (n-1 = 2).
          expect(a.activeFrameIndex).toBe(frameCount - 1);
        },
      ),
    );
  });
});

// A3: dt additivity (scoped).
// For a looping clip with NO transitions, update(a) then update(b) yields the same
// (activeFrameKey, activeFrameIndex) as a single update(a+b) WHEN a+b < total (no wrap).
// NOTE: this property does NOT hold across transition/loop boundaries (a wrap at elapsed%total
// resets the phase) or when a+b === total (exact boundary); we restrict to a+b < total only.
describe("property: dt additivity for looping clip (no-transition, no-wrap)", () => {
  it("update(a) then update(b) == update(a+b) when a+b < total", () => {
    // idle has 2 frames each 200ms; total=400ms.
    const total = 400;
    fc.assert(
      fc.property(
        // Generate a and b such that both are non-negative and a+b < total.
        fc
          .integer({ min: 0, max: total - 2 })
          .chain((a) => fc.integer({ min: 0, max: total - a - 1 }).map((b) => [a, b] as const)),
        ([a, b]) => {
          // Two-step animator.
          const a1 = createSpriteAnimator({
            animations: { idle: ["idle_0", "idle_1"] },
            frames: { idle_0: { duration: 200 }, idle_1: { duration: 200 } },
            inputs: {},
            states: { idle: { animation: "idle", loop: true } },
            transitions: [],
            initial: "idle",
          });
          a1.update(a);
          a1.update(b);
          // Single-step animator.
          const a2 = createSpriteAnimator({
            animations: { idle: ["idle_0", "idle_1"] },
            frames: { idle_0: { duration: 200 }, idle_1: { duration: 200 } },
            inputs: {},
            states: { idle: { animation: "idle", loop: true } },
            transitions: [],
            initial: "idle",
          });
          a2.update(a + b);
          expect(a1.activeFrameKey).toBe(a2.activeFrameKey);
          expect(a1.activeFrameIndex).toBe(a2.activeFrameIndex);
        },
      ),
    );
  });
});
