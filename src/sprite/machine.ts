// aispritejs — the input-driven visual state machine (the "RiveSpriteStateMachine"
// engine), exposed only through the `createSpriteAnimator` factory. Implemented
// as closures, not a class, so methods never depend on `this` and the
// constructor surface stays hidden (family convention: public API = createX).
//
// Determinism: the only state advanced by `update` is `elapsed` (by `dt * speed`)
// plus the input store; transitions are resolved over precomputed, deterministically
// ordered candidate lists. Identical input + dt sequences therefore yield identical
// frame sequences. The no-transition path allocates nothing.
//
// Run-to-completion: `update()` / `reset()` own the machine's state, so a call
// made while one is already dispatching (from an `onStateChange` / `onComplete`
// listener) is queued in a FIFO mailbox and runs after the current call's last
// notification (ai*js family rule for state-owning dispatchers).

import { type CompiledState, type CompiledTransition, compileGraph } from "./compile.js";
import { createSignal } from "./emitter.js";
import { SpriteAnimatorDisposedError } from "./errors.js";
import { createInputStore } from "./inputs.js";
import type {
  CompleteHandler,
  ListenerOptions,
  SpriteAnimator,
  SpriteGraph,
  StateChangeHandler,
  Unsubscribe,
} from "./types.js";

interface StateChangePayload {
  readonly to: string;
  readonly from: string;
}

const NO_TRIGGERS: readonly string[] = [];

/** A nested `update()` / `reset()` waiting for the current dispatch to finish. */
type Queued = { readonly kind: "update"; readonly dt: number } | { readonly kind: "reset" };

/**
 * Build a renderer-agnostic visual animator from an input-driven graph.
 *
 * @param graph - inputs, states, transitions, animations (+ optional per-frame
 *   timings). Validated eagerly; an invalid graph throws {@link InvalidGraphError}
 *   and no animator is returned.
 * @returns a {@link SpriteAnimator}.
 *
 * @public
 */
export function createSpriteAnimator(graph: SpriteGraph): SpriteAnimator {
  const compiled = compileGraph(graph);
  const store = createInputStore(graph.inputs);
  const stateChange = createSignal<StateChangePayload>();
  const complete = createSignal<string>();

  let current: CompiledState = mustState(compiled.initial);
  let elapsed = 0;
  let completed = false;
  let activeFrameIndex = 0;
  // Every compiled state has >= 1 frame (validated), so frame 0 always exists.
  let activeFrameKey: string = current.frameKeys[0]!;
  let disposed = false;
  let dispatching = false;
  const mailbox: Queued[] = [];

  // `name` is always an initial / transition `to` / `onEnd` target, all
  // validated to exist by compileGraph, so the lookup never misses.
  function mustState(name: string): CompiledState {
    return compiled.states.get(name)!;
  }

  /** Enter `to`, optionally consuming the triggers the taking transition used. */
  function enter(to: string, consume: readonly string[]): void {
    const from = current.name;
    for (let i = 0; i < consume.length; i++) {
      store.consume(consume[i]!);
    }
    current = mustState(to);
    elapsed = 0;
    completed = false;
    activeFrameIndex = 0;
    activeFrameKey = current.frameKeys[0]!;
    // A self-re-entry (to === from) restarts the clip but is not a state change.
    if (to !== from) stateChange.emit({ to, from });
  }

  /**
   * First *effective* transition leaving `current` (own + Any-State), in
   * (priority desc, declared order) — or `undefined`. A transition whose target
   * equals the current state is effective only if it consumes a Trigger (a
   * Number/Boolean self-loop would otherwise restart the clip every frame).
   */
  function resolve(): CompiledTransition | undefined {
    // Every state has a candidate list (built for all states by compileGraph).
    const list = compiled.candidatesByState.get(current.name)!;
    for (let i = 0; i < list.length; i++) {
      const t = list[i]!;
      let ok = true;
      const conds = t.conditions;
      for (let j = 0; j < conds.length; j++) {
        if (!conds[j]!(store)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (t.to === current.name && t.triggers.length === 0) continue;
      return t;
    }
    return undefined;
  }

  function processUpdate(deltaMs: number): void {
    // Advance the playback timer (non-finite or non-positive dt clamped to 0 for determinism).
    // NOTE: `elapsed` accumulates without bound in looping states (intentional design choice).
    // Drift from floating-point accumulation is sub-ULP-relevant only after continuous play
    // on the order of years; a periodic reset (e.g. on state entry) would be premature.
    // A step that would overflow `elapsed` to Infinity (whose `% total` is NaN) is
    // dropped: clamped to no progress, like an invalid dt.
    const next = elapsed + (Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0) * current.speed;
    if (Number.isFinite(next)) elapsed = next;

    // Evaluate input-driven transitions first; an explicit transition wins over
    // implicit end-of-clip behaviour.
    const chosen = resolve();
    if (chosen) {
      enter(chosen.to, chosen.triggers);
      return;
    }

    // Compute the active frame from accumulated time vs cumulative durations.
    const cs = current;
    const n = cs.frameKeys.length;
    let ended = false;
    if (!cs.loop && elapsed >= cs.total) {
      activeFrameIndex = n - 1;
      ended = true;
    } else {
      const t = cs.loop ? elapsed % cs.total : elapsed;
      let i = 0;
      // First index whose cumulative end exceeds t (i < n-1 keeps it in range,
      // and t < total guarantees a match no later than the last frame).
      while (i < n - 1 && t >= cs.cumulative[i]!) i++;
      activeFrameIndex = i;
    }
    activeFrameKey = cs.frameKeys[activeFrameIndex]!;

    // Fire onComplete once for a finished non-looping clip, then auto-transition.
    if (ended && !completed) {
      completed = true;
      try {
        complete.emit(cs.name);
      } finally {
        // A reset() / update() from an onComplete handler is queued (it runs
        // after this), so only dispose() can intervene here. Runs in `finally`
        // so a throwing handler cannot wedge the machine on its last frame
        // (`completed` is already set, so no later tick would).
        if (cs.onEnd !== undefined && !disposed) enter(cs.onEnd, NO_TRIGGERS);
      }
    }
  }

  function processReset(): void {
    store.reset();
    // Restarts the initial clip; notifies only if the state actually changes.
    enter(compiled.initial, NO_TRIGGERS);
  }

  /**
   * Run `first(dt)` to completion, then drain the calls its listeners queued,
   * in order. dispose() empties the mailbox, which ends the drain. A throw drops
   * whatever is still queued and propagates from this (outermost) call. Takes
   * `dt` separately so the per-frame path allocates no closure.
   */
  function run(first: (dt: number) => void, dt: number): void {
    dispatching = true;
    try {
      first(dt);
      while (mailbox.length > 0) {
        const m = mailbox.shift()!;
        if (m.kind === "update") processUpdate(m.dt);
        else processReset();
      }
    } finally {
      dispatching = false;
      mailbox.length = 0;
    }
  }

  function update(deltaMs: number): void {
    if (disposed) throw new SpriteAnimatorDisposedError();
    if (dispatching) mailbox.push({ kind: "update", dt: deltaMs });
    else run(processUpdate, deltaMs);
  }

  function reset(): void {
    if (disposed) throw new SpriteAnimatorDisposedError();
    if (dispatching) mailbox.push({ kind: "reset" });
    else run(processReset, 0);
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    mailbox.length = 0;
    stateChange.clear();
    complete.clear();
  }

  return {
    setInput(name, value) {
      if (disposed) throw new SpriteAnimatorDisposedError();
      store.setInput(name, value);
    },
    fireTrigger(name) {
      if (disposed) throw new SpriteAnimatorDisposedError();
      store.fireTrigger(name);
    },
    update,
    reset,
    dispose,
    onStateChange(handler: StateChangeHandler, options?: ListenerOptions): Unsubscribe {
      if (disposed) return () => {};
      return stateChange.on((p) => handler(p.to, p.from), options);
    },
    onComplete(handler: CompleteHandler, options?: ListenerOptions): Unsubscribe {
      if (disposed) return () => {};
      return complete.on(handler, options);
    },
    get activeState() {
      return current.name;
    },
    get activeFrameKey() {
      return activeFrameKey;
    },
    get activeFrameIndex() {
      return activeFrameIndex;
    },
    get disposed() {
      return disposed;
    },
  };
}
