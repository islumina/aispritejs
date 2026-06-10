import { describe, expect, it, vi } from "vitest";
import { type SpriteAnimator, createSpriteAnimator } from "../src/index.js";
import { platformer } from "./fixtures/graphs.js";

// Toggle idle⇄walk to emit a state change on demand.
function toWalk(a: SpriteAnimator): void {
  a.setInput("speed", 1);
  a.update(0);
}
function toIdle(a: SpriteAnimator): void {
  a.setInput("speed", 0);
  a.update(0);
}

describe("onStateChange", () => {
  it("notifies every listener with (to, from)", () => {
    const a = createSpriteAnimator(platformer());
    const one = vi.fn();
    const two = vi.fn();
    a.onStateChange(one);
    a.onStateChange(two);
    toWalk(a);
    expect(one).toHaveBeenCalledWith("walk", "idle");
    expect(two).toHaveBeenCalledWith("walk", "idle");
  });

  it("stops notifying after unsubscribe", () => {
    const a = createSpriteAnimator(platformer());
    const fn = vi.fn();
    const unsub = a.onStateChange(fn);
    unsub();
    toWalk(a);
    expect(fn).not.toHaveBeenCalled();
  });

  it("honours { once } — fires a single time across many changes", () => {
    const a = createSpriteAnimator(platformer());
    const fn = vi.fn();
    a.onStateChange(fn, { once: true });
    toWalk(a);
    toIdle(a);
    toWalk(a);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("removes the listener when its { signal } aborts", () => {
    const a = createSpriteAnimator(platformer());
    const fn = vi.fn();
    const ctrl = new AbortController();
    a.onStateChange(fn, { signal: ctrl.signal });
    toWalk(a);
    expect(fn).toHaveBeenCalledTimes(1);
    ctrl.abort();
    toIdle(a);
    toWalk(a);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("never attaches a listener for an already-aborted signal", () => {
    const a = createSpriteAnimator(platformer());
    const fn = vi.fn();
    const unsub = a.onStateChange(fn, { signal: AbortSignal.abort() });
    toWalk(a);
    expect(fn).not.toHaveBeenCalled();
    expect(unsub).toBeTypeOf("function");
    unsub();
  });

  it("cleans up the abort listener for a { once, signal } handler", () => {
    const a = createSpriteAnimator(platformer());
    const fn = vi.fn();
    const ctrl = new AbortController();
    a.onStateChange(fn, { once: true, signal: ctrl.signal });
    toWalk(a); // fires once, cleanup detaches the abort listener
    expect(fn).toHaveBeenCalledTimes(1);
    expect(() => ctrl.abort()).not.toThrow(); // detached cleanly
    toIdle(a);
    toWalk(a);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("onComplete", () => {
  it("supports { once } and unsubscribe", () => {
    const a = createSpriteAnimator({
      animations: { attack: ["a0"] },
      frames: { a0: { duration: 100 } },
      inputs: { go: { type: "trigger" } },
      states: { attack: { animation: "attack", loop: false }, idle: { animation: "attack" } },
      transitions: [{ from: "attack", to: "idle", when: [{ input: "go", op: "Trigger" }] }],
      initial: "attack",
    });
    const fn = vi.fn();
    const unsub = a.onComplete(fn, { once: true });
    a.update(100); // completes
    expect(fn).toHaveBeenCalledExactlyOnceWith("attack");
    unsub(); // no throw after a once-handler already cleaned up
  });
});

describe("emitter edge cases", () => {
  it("does not invoke listeners registered before dispose, and blocks further driving", () => {
    const a = createSpriteAnimator(platformer());
    const spy = vi.fn();
    a.onStateChange(spy);
    a.dispose();
    expect(spy).not.toHaveBeenCalled(); // dispose clears listeners; nothing fires
    expect(() => a.update(0)).toThrow(); // a disposed machine cannot be driven
  });

  it("a handler that unsubscribes itself mid-emit does not disturb the others", () => {
    const a = createSpriteAnimator(platformer());
    const calls: string[] = [];
    let unsubA: () => void = () => {};
    const A = vi.fn(() => {
      calls.push("A");
      unsubA(); // remove self during this emit
    });
    const B = vi.fn(() => {
      calls.push("B");
    });
    unsubA = a.onStateChange(A);
    a.onStateChange(B);

    toWalk(a); // first emit: the snapshot lets both fire once, in order
    expect(calls).toEqual(["A", "B"]);

    toIdle(a); // second emit: A removed itself → only B fires
    expect(A).toHaveBeenCalledTimes(1);
    expect(B).toHaveBeenCalledTimes(2);
  });

  // SPR-R-01: dispose() must detach abort hooks from caller AbortSignals so
  // long-lived signals do not accumulate dead handlers after the machine dies.
  it("dispose() detaches abort hooks from caller AbortSignals (SPR-R-01)", () => {
    const a = createSpriteAnimator(platformer());
    const ctrl = new AbortController();

    // Spy on the signal's removeEventListener so we can assert it is called.
    const removeSpy = vi.spyOn(ctrl.signal, "removeEventListener");

    const fn = vi.fn();
    a.onStateChange(fn, { signal: ctrl.signal });

    // Baseline: no detach yet.
    expect(removeSpy).not.toHaveBeenCalled();

    // dispose() must flush all abort hooks.
    a.dispose();

    // The abort hook must have been detached.
    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));

    // The signal must not have residual listeners — firing it after dispose
    // must not invoke the handler.
    fn.mockClear();
    ctrl.abort();
    expect(fn).not.toHaveBeenCalled();
  });

  // SPR-R-01 (onComplete channel): same contract via the complete signal.
  it("dispose() detaches abort hooks from onComplete AbortSignals (SPR-R-01)", () => {
    const a = createSpriteAnimator({
      animations: { idle: ["i0"] },
      inputs: {},
      states: { idle: { animation: "idle", loop: false } },
      transitions: [],
      initial: "idle",
    });
    const ctrl = new AbortController();
    const removeSpy = vi.spyOn(ctrl.signal, "removeEventListener");
    a.onComplete(vi.fn(), { signal: ctrl.signal });
    expect(removeSpy).not.toHaveBeenCalled();
    a.dispose();
    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  // B9: emitter abort-before-fire.
  // Register onStateChange and onComplete with { once, signal }, abort the controller
  // BEFORE any state change, then cause a state change — the handlers must never fire
  // and no internal corruption should occur (a normal listener still works).
  it("abort-before-fire: { once, signal } handler never invoked after pre-fire abort", () => {
    const a = createSpriteAnimator(platformer());
    const abortedHandler = vi.fn();
    const normalHandler = vi.fn();
    const abortedComplete = vi.fn();

    const ctrl = new AbortController();
    // Register with { once, signal } on both channels.
    a.onStateChange(abortedHandler, { once: true, signal: ctrl.signal });
    a.onComplete(abortedComplete, { once: true, signal: ctrl.signal });
    // Register a normal (no signal) listener to verify it still works after abort.
    a.onStateChange(normalHandler);

    // Abort BEFORE any state change.
    ctrl.abort();

    // Now cause a state change (idle → walk).
    toWalk(a);

    // The aborted handler must have never been called.
    expect(abortedHandler).not.toHaveBeenCalled();
    // The normal listener still works — no internal corruption.
    expect(normalHandler).toHaveBeenCalledOnce();
    // onComplete handler also never called (no clip completion here, just verifying no crash).
    expect(abortedComplete).not.toHaveBeenCalled();
  });
});
