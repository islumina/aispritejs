import { describe, expect, it, vi } from "vitest";
import { SpriteAnimatorDisposedError, createSpriteAnimator } from "../src/index.js";
import { clips, platformer } from "./fixtures/graphs.js";

describe("initial state", () => {
  it("starts in the declared initial state on frame 0", () => {
    const a = createSpriteAnimator(platformer());
    expect(a.activeState).toBe("idle");
    expect(a.activeFrameKey).toBe("idle_0");
    expect(a.activeFrameIndex).toBe(0);
    expect(a.disposed).toBe(false);
  });

  it("defaults the initial state to the first declared state", () => {
    const a = createSpriteAnimator({
      animations: { a: ["a0"], b: ["b0"] },
      inputs: {},
      states: { a: { animation: "a" }, b: { animation: "b" } },
      transitions: [],
    });
    expect(a.activeState).toBe("a");
  });
});

describe("number / boolean conditions", () => {
  it("transitions idle→walk when speed > 0 and back when speed === 0", () => {
    const a = createSpriteAnimator(platformer());
    a.setInput("speed", 5);
    a.update(0);
    expect(a.activeState).toBe("walk");

    a.setInput("speed", 0);
    a.update(0);
    expect(a.activeState).toBe("idle");
  });

  it("evaluates without advancing time on update(0)", () => {
    const a = createSpriteAnimator(platformer());
    a.setInput("speed", 1);
    a.update(0);
    expect(a.activeState).toBe("walk");
    expect(a.activeFrameIndex).toBe(0);
  });

  it("supports LessThan, and number / boolean NotEquals operators", () => {
    const a = createSpriteAnimator({
      animations: { lo: ["lo0"], hi: ["hi0"], other: ["o0"], done: ["d0"] },
      inputs: { n: { type: "number", default: 5 }, flag: { type: "boolean", default: true } },
      states: {
        lo: { animation: "lo" },
        hi: { animation: "hi" },
        other: { animation: "other" },
        done: { animation: "done" },
      },
      transitions: [
        { from: "lo", to: "hi", when: [{ input: "n", op: "LessThan", value: 3 }] },
        { from: "hi", to: "other", when: [{ input: "flag", op: "NotEquals", value: true }] },
        { from: "other", to: "done", when: [{ input: "n", op: "NotEquals", value: 5 }] },
      ],
      initial: "lo",
    });
    a.setInput("n", 1); // 1 < 3 → hi; also 1 !== 5 later
    a.update(0);
    expect(a.activeState).toBe("hi");
    a.setInput("flag", false); // false !== true → other
    a.update(0);
    expect(a.activeState).toBe("other");
    a.update(0); // n (1) !== 5 → done  (exercises the number NotEquals closure)
    expect(a.activeState).toBe("done");
  });
});

describe("triggers", () => {
  it("fires an Any-State transition and consumes the trigger (one-shot)", () => {
    const a = createSpriteAnimator(platformer());
    a.fireTrigger("jump");
    a.update(0);
    expect(a.activeState).toBe("jump");

    // Leave jump by returning the input that no longer holds: set speed and go
    // back to idle is not wired from jump, so it stays — but a second update
    // without re-firing must NOT re-pick the (consumed) trigger.
    a.update(16);
    expect(a.activeState).toBe("jump");
  });

  it("jump wins over walk by priority when both conditions hold", () => {
    const a = createSpriteAnimator(platformer());
    a.setInput("speed", 9);
    a.fireTrigger("jump");
    a.update(0);
    expect(a.activeState).toBe("jump");
  });

  it("re-triggering the same state restarts the clip without a state change", () => {
    const a = createSpriteAnimator(platformer());
    a.fireTrigger("jump");
    a.update(0);
    expect(a.activeState).toBe("jump");

    a.update(100); // advance into frame 1
    expect(a.activeFrameIndex).toBe(1);

    const onChange = vi.fn();
    a.onStateChange(onChange);
    a.fireTrigger("jump");
    a.update(0); // self re-entry: restart, no onStateChange
    expect(a.activeFrameIndex).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps a pending trigger across frames until a state that consumes it is reached", () => {
    // `special` is only consumed by b→c. Fire it while in `a` (no consumer),
    // advance several frames + take the unrelated a→b transition, and prove it
    // survived to fire b→c — real cross-frame persistence, not fire-then-update.
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
    a.fireTrigger("special");
    a.update(16);
    expect(a.activeState).toBe("a"); // no consumer in `a` → special survives
    a.update(16);
    expect(a.activeState).toBe("a"); // still pending across another frame
    a.setInput("go", true);
    a.update(0);
    expect(a.activeState).toBe("b"); // a→b (boolean) does NOT consume special
    a.update(0);
    expect(a.activeState).toBe("c"); // b consumes the still-pending special
    a.update(0);
    expect(a.activeState).toBe("c"); // consumed once; no spurious re-fire
  });
});

describe("multi-condition transitions (AND)", () => {
  it("requires every when-condition to hold before transitioning", () => {
    const a = createSpriteAnimator({
      animations: { s0: ["x0"], s1: ["y0"] },
      inputs: { n: { type: "number", default: 0 }, b: { type: "boolean", default: false } },
      states: { s0: { animation: "s0", loop: true }, s1: { animation: "s1", loop: true } },
      transitions: [
        {
          from: "s0",
          to: "s1",
          when: [
            { input: "n", op: "GreaterThan", value: 0 },
            { input: "b", op: "Equals", value: true },
          ],
        },
      ],
      initial: "s0",
    });
    a.setInput("n", 5); // only the first condition holds
    a.update(0);
    expect(a.activeState).toBe("s0"); // b still false → no transition
    a.setInput("b", true); // now both hold
    a.update(0);
    expect(a.activeState).toBe("s1");
  });
});

describe("self-transition skip rule", () => {
  it("ignores a Number self-loop so the clip is not reset every frame", () => {
    const a = createSpriteAnimator({
      animations: { run: ["r0", "r1", "r2"] },
      frames: { r0: { duration: 100 }, r1: { duration: 100 }, r2: { duration: 100 } },
      inputs: { speed: { type: "number", default: 1 } },
      states: { run: { animation: "run", loop: true } },
      transitions: [
        { from: "run", to: "run", when: [{ input: "speed", op: "GreaterThan", value: 0 }] },
      ],
      initial: "run",
    });
    a.update(100);
    a.update(100);
    expect(a.activeFrameIndex).toBe(2); // advanced, not stuck on 0
  });
});

describe("priority and declared-order tie-break", () => {
  it("breaks equal-priority ties by declared order (first wins)", () => {
    const a = createSpriteAnimator({
      animations: { idle: ["i0"], walk: ["w0"], jump: ["j0"] },
      inputs: { flag: { type: "boolean", default: false } },
      states: {
        idle: { animation: "idle" },
        walk: { animation: "walk" },
        jump: { animation: "jump" },
      },
      transitions: [
        { from: "idle", to: "walk", when: [{ input: "flag", op: "Equals", value: true }] },
        { from: "idle", to: "jump", when: [{ input: "flag", op: "Equals", value: true }] },
      ],
      initial: "idle",
    });
    a.setInput("flag", true);
    a.update(0);
    expect(a.activeState).toBe("walk");
  });

  it("an unconditional transition fires immediately", () => {
    const a = createSpriteAnimator({
      animations: { intro: ["in0"], idle: ["id0"] },
      inputs: {},
      states: { intro: { animation: "intro" }, idle: { animation: "idle" } },
      transitions: [{ from: "intro", to: "idle" }],
      initial: "intro",
    });
    a.update(0);
    expect(a.activeState).toBe("idle");
  });
});

describe("frame timing", () => {
  it("advances through a looping clip and wraps at total duration", () => {
    const a = createSpriteAnimator(platformer());
    a.setInput("speed", 1);
    a.update(0); // → walk, frame 0
    expect(a.activeFrameKey).toBe("walk_0");
    a.update(100);
    expect(a.activeFrameKey).toBe("walk_1");
    a.update(100);
    expect(a.activeFrameKey).toBe("walk_2");
    a.update(100);
    expect(a.activeFrameKey).toBe("walk_3");
    a.update(100); // 400 % 400 === 0 → wrap to frame 0
    expect(a.activeFrameKey).toBe("walk_0");
  });

  it("applies a per-state speed multiplier as a time scale", () => {
    const a = createSpriteAnimator(clips());
    a.setInput("go", true);
    a.update(0); // → run (speed 2), frame 0
    expect(a.activeState).toBe("run");
    a.update(50); // 50 * 2 = 100 ms → frame 1
    expect(a.activeFrameKey).toBe("run_1");
  });

  it("uses the default frame duration when a frame omits one", () => {
    const a = createSpriteAnimator(clips());
    a.setInput("go", true);
    a.update(0);
    // run_* have no explicit duration → default 100 ms; at speed 2, 50ms→frame1
    a.update(50);
    expect(a.activeFrameIndex).toBe(1);
  });

  it("clamps negative delta to zero", () => {
    const a = createSpriteAnimator(platformer());
    a.setInput("speed", 1);
    a.update(0);
    a.update(-1000);
    expect(a.activeFrameIndex).toBe(0);
  });

  it("clamps non-finite dt (Infinity / NaN) to zero so elapsed is not poisoned", () => {
    // Use a looping clip; if elapsed became Infinity or NaN the frame would
    // snap to 0 permanently and a subsequent finite update could not advance it.
    const a = createSpriteAnimator(platformer());
    a.setInput("speed", 1);
    a.update(0); // → walk, frame 0
    expect(a.activeState).toBe("walk");
    expect(a.activeFrameIndex).toBe(0);

    // Non-finite ticks must behave like update(0): no frame advance.
    a.update(Number.POSITIVE_INFINITY);
    expect(a.activeFrameIndex).toBe(0);
    expect(a.activeFrameKey).toBe("walk_0");

    a.update(Number.NaN);
    expect(a.activeFrameIndex).toBe(0);
    expect(a.activeFrameKey).toBe("walk_0");

    // Elapsed must not have been poisoned — a normal tick should still advance.
    a.update(100); // walk frames are 100 ms each → should reach frame 1
    expect(a.activeFrameIndex).toBe(1);
    expect(a.activeFrameKey).toBe("walk_1");
  });
});

describe("onComplete and onEnd", () => {
  it("fires onComplete once for a non-looping clip and holds the last frame", () => {
    const a = createSpriteAnimator({
      animations: { attack: ["a0", "a1"] },
      frames: { a0: { duration: 100 }, a1: { duration: 100 } },
      inputs: {},
      states: { attack: { animation: "attack", loop: false } },
      transitions: [],
      initial: "attack",
    });
    const onComplete = vi.fn();
    a.onComplete(onComplete);

    a.update(100); // frame 1
    expect(onComplete).not.toHaveBeenCalled();
    a.update(100); // reaches end
    expect(onComplete).toHaveBeenCalledExactlyOnceWith("attack");
    expect(a.activeFrameKey).toBe("a1");
    a.update(100); // still ended, no second fire
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(a.activeFrameKey).toBe("a1");
  });

  it("auto-transitions via onEnd and fires onStateChange", () => {
    const a = createSpriteAnimator(clips());
    const onComplete = vi.fn();
    const onChange = vi.fn();
    a.onComplete(onComplete);
    a.onStateChange(onChange);

    a.fireTrigger("attack");
    a.update(0); // → attack, frame 0
    expect(a.activeState).toBe("attack");

    a.update(300); // attack total = 300 ms → completes, onEnd → idle
    expect(onComplete).toHaveBeenCalledExactlyOnceWith("attack");
    expect(a.activeState).toBe("idle");
    expect(onChange).toHaveBeenCalledWith("idle", "attack");
  });

  it("never fires onComplete for a looping clip", () => {
    const a = createSpriteAnimator(platformer());
    const onComplete = vi.fn();
    a.onComplete(onComplete);
    for (let i = 0; i < 20; i++) a.update(100);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("lets an explicit input transition win over end-of-clip behaviour", () => {
    // attack is non-looping with onEnd idle, but an Any-State trigger to attack
    // takes precedence the frame it would have completed.
    const a = createSpriteAnimator(clips());
    a.fireTrigger("attack");
    a.update(0);
    a.fireTrigger("attack"); // re-arm
    a.update(300); // would complete, but self-retrigger fires first
    expect(a.activeState).toBe("attack");
    expect(a.activeFrameIndex).toBe(0);
  });
});

describe("reset", () => {
  it("returns to the initial state and restores input defaults", () => {
    const a = createSpriteAnimator(platformer());
    a.setInput("speed", 5);
    a.update(0);
    expect(a.activeState).toBe("walk");

    const onChange = vi.fn();
    a.onStateChange(onChange);
    a.reset();
    expect(a.activeState).toBe("idle");
    expect(a.activeFrameIndex).toBe(0);
    expect(onChange).toHaveBeenCalledWith("idle", "walk");

    // speed restored to default 0 → stays idle on next update
    a.update(0);
    expect(a.activeState).toBe("idle");
  });

  it("does not fire onStateChange when already in the initial state", () => {
    const a = createSpriteAnimator(platformer());
    const onChange = vi.fn();
    a.onStateChange(onChange);
    a.reset();
    expect(onChange).not.toHaveBeenCalled();
    expect(a.activeState).toBe("idle");
  });
});

describe("dispose", () => {
  it("is idempotent and blocks mutators afterwards", () => {
    const a = createSpriteAnimator(platformer());
    a.dispose();
    a.dispose(); // no throw
    expect(a.disposed).toBe(true);

    expect(() => a.update(16)).toThrow(SpriteAnimatorDisposedError);
    expect(() => a.setInput("speed", 1)).toThrow(SpriteAnimatorDisposedError);
    expect(() => a.fireTrigger("jump")).toThrow(SpriteAnimatorDisposedError);
    expect(() => a.reset()).toThrow(SpriteAnimatorDisposedError);
  });

  it("keeps the last frame readable and returns no-op subscriptions", () => {
    const a = createSpriteAnimator(platformer());
    a.setInput("speed", 1);
    a.update(0);
    a.dispose();
    expect(a.activeState).toBe("walk");
    expect(a.activeFrameKey).toBe("walk_0");

    const onChange = vi.fn();
    const unsub = a.onStateChange(onChange);
    expect(unsub).toBeTypeOf("function");
    unsub(); // no throw

    const unsubComplete = a.onComplete(vi.fn());
    expect(unsubComplete).toBeTypeOf("function");
    unsubComplete(); // no throw
  });
});

describe("determinism", () => {
  it("produces identical frame sequences for identical input + dt sequences", () => {
    const run = () => {
      const a = createSpriteAnimator(platformer());
      const frames: string[] = [];
      a.setInput("speed", 3);
      const steps = [0, 50, 50, 50, 50, 50, 50, 50, 50];
      for (const dt of steps) {
        a.update(dt);
        frames.push(`${a.activeState}:${a.activeFrameKey}`);
      }
      return frames;
    };
    expect(run()).toEqual(run());
  });
});

// B6: self-onEnd
// A non-looping state whose `onEnd` is its own name: each time the clip finishes,
// onComplete fires again and the animator re-enters the same state (restarting it).
// No onStateChange fires because re-entry of the same state is NOT a state change.
// This repeating behavior is intentional: the clip loops via the onEnd mechanism
// rather than via `loop: true`.
describe("self-onEnd", () => {
  it("fires onComplete again on each subsequent completion and no onStateChange", () => {
    const a = createSpriteAnimator({
      animations: { flash: ["f0", "f1"] },
      frames: { f0: { duration: 100 }, f1: { duration: 100 } },
      inputs: {},
      states: { flash: { animation: "flash", loop: false, onEnd: "flash" } },
      transitions: [],
      initial: "flash",
    });
    const completeCalls: string[] = [];
    const changeCalls: string[] = [];
    a.onComplete((s) => completeCalls.push(s));
    a.onStateChange((to, from) => changeCalls.push(`${from}→${to}`));

    // First completion (total = 200ms).
    a.update(200);
    expect(completeCalls).toEqual(["flash"]);
    expect(changeCalls).toEqual([]); // self-re-entry is NOT a state change

    // Second completion — onEnd re-enters flash, which completes again.
    a.update(200);
    expect(completeCalls).toEqual(["flash", "flash"]);
    expect(changeCalls).toEqual([]); // still no state change

    // Third completion.
    a.update(200);
    expect(completeCalls).toHaveLength(3);
    expect(changeCalls).toEqual([]); // no state change throughout
  });
});

// B7: onEnd chain
// A (non-looping, onEnd:B) → B (non-looping, onEnd:C): onComplete fires once per
// state in order and the animator ends in C.
// Design note: each update() call processes exactly one state completion; the onEnd
// auto-transition *enters* the next state but does not recursively complete it in
// the same tick. So stateA→stateB happens on update(100), stateB→stateC on the
// next update(100), and stateC completes on the third update(100).
describe("onEnd chain", () => {
  it("chains A→B→C via onEnd and fires onComplete once per state in order", () => {
    const a = createSpriteAnimator({
      animations: { stateA: ["a0"], stateB: ["b0"], stateC: ["c0"] },
      frames: { a0: { duration: 100 }, b0: { duration: 100 }, c0: { duration: 100 } },
      inputs: {},
      states: {
        stateA: { animation: "stateA", loop: false, onEnd: "stateB" },
        stateB: { animation: "stateB", loop: false, onEnd: "stateC" },
        stateC: { animation: "stateC", loop: false },
      },
      transitions: [],
      initial: "stateA",
    });
    const completions: string[] = [];
    const changes: string[] = [];
    a.onComplete((s) => completions.push(s));
    a.onStateChange((to, from) => changes.push(`${from}→${to}`));

    // First tick: stateA completes and auto-transitions to stateB.
    a.update(100);
    expect(completions).toEqual(["stateA"]);
    expect(a.activeState).toBe("stateB");
    expect(changes).toEqual(["stateA→stateB"]);

    // Second tick: stateB completes and auto-transitions to stateC.
    a.update(100);
    expect(completions).toEqual(["stateA", "stateB"]);
    expect(a.activeState).toBe("stateC");
    expect(changes).toEqual(["stateA→stateB", "stateB→stateC"]);

    // Third tick: stateC completes (no onEnd, stays in stateC).
    a.update(100);
    expect(completions).toEqual(["stateA", "stateB", "stateC"]);
    expect(a.activeState).toBe("stateC"); // no onEnd, stays put
  });
});

// C7: onComplete handler calls reset() — onEnd must NOT overwrite it
// A non-looping state with onEnd:"idle" whose onComplete handler calls reset().
// After complete.emit() fires the handler, the machine is back in the initial
// state. The subsequent enter(onEnd) must be skipped; the animator must stay in
// the initial state, not jump to onEnd.
describe("onComplete reset/dispose guard (C7)", () => {
  function makeGraph() {
    return {
      animations: {
        initial: ["i0"],
        action: ["a0"],
        after: ["af0"],
      },
      frames: {
        i0: { duration: 100 },
        a0: { duration: 100 },
        af0: { duration: 100 },
      },
      inputs: {},
      states: {
        initial: { animation: "initial", loop: true },
        action: { animation: "action", loop: false, onEnd: "after" },
        after: { animation: "after", loop: true },
      },
      transitions: [],
      initial: "initial",
    } as const;
  }

  it("reset() inside onComplete keeps the machine in the initial state (not onEnd)", () => {
    const a = createSpriteAnimator(makeGraph());
    // Manually enter "action" by rebuilding with action as initial — or just
    // use a graph where action is the declared initial so update() triggers it.
    const b = createSpriteAnimator({
      animations: {
        action: ["a0"],
        after: ["af0"],
        home: ["h0"],
      },
      frames: {
        a0: { duration: 100 },
        af0: { duration: 100 },
        h0: { duration: 100 },
      },
      inputs: {},
      states: {
        action: { animation: "action", loop: false, onEnd: "after" },
        after: { animation: "after", loop: true },
        home: { animation: "home", loop: true },
      },
      transitions: [],
      initial: "action",
    });

    b.onComplete(() => b.reset());
    b.update(100); // action completes → onComplete fires reset() → should stay in "action" (initial)
    // onEnd "after" must NOT overwrite the reset
    expect(b.activeState).toBe("action"); // initial state of this graph
    expect(b.disposed).toBe(false);
  });

  it("dispose() inside onComplete leaves the machine disposed and activeState unchanged", () => {
    const b = createSpriteAnimator({
      animations: {
        action: ["a0"],
        after: ["af0"],
      },
      frames: {
        a0: { duration: 100 },
        af0: { duration: 100 },
      },
      inputs: {},
      states: {
        action: { animation: "action", loop: false, onEnd: "after" },
        after: { animation: "after", loop: true },
      },
      transitions: [],
      initial: "action",
    });

    const stateAtDispose = { name: "" };
    b.onComplete(() => {
      stateAtDispose.name = b.activeState;
      b.dispose();
    });
    b.update(100); // action completes → onComplete fires dispose()
    // onEnd "after" must NOT run after dispose
    expect(b.disposed).toBe(true);
    expect(b.activeState).toBe("action"); // unchanged after dispose
  });
});
