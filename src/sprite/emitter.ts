// aispritejs — a tiny single-payload typed signal. This is the package's OWN
// emitter; it deliberately does NOT import `aieventjs` or any sibling (P0
// zero-cross-package rule). Two instances back `onStateChange` and
// `onComplete`.

import type { ListenerOptions, Unsubscribe } from "./types.js";

/**
 * A typed fan-out of one payload `P`. `emit` is allocation-free in the common
 * case; it snapshots listeners only when there is at least one, so a handler
 * that unsubscribes (or a `once` handler) cannot corrupt the in-flight
 * iteration.
 */
export interface Signal<P> {
  on(handler: (payload: P) => void, options?: ListenerOptions): Unsubscribe;
  emit(payload: P): void;
  /** Drop every listener (used by `dispose`). */
  clear(): void;
}

export function createSignal<P>(): Signal<P> {
  const listeners = new Set<(payload: P) => void>();
  // Parallel registry of cleanup functions so clear() can detach abort hooks
  // as well as clearing the listener set (fixes SPR-R-01).
  const cleanups = new Map<(payload: P) => void, Unsubscribe>();

  function on(handler: (payload: P) => void, options?: ListenerOptions): Unsubscribe {
    // An already-aborted signal means the listener is dead on arrival.
    if (options?.signal?.aborted) return () => {};

    let detachAbort: (() => void) | undefined;
    // One teardown shared by the unsubscribe return, the once-wrapper, and the
    // abort handler, so every path also detaches the abort listener — a `once`
    // handler that passed a `{ signal }` must not leave the abort listener
    // attached after it fires.
    const cleanup: Unsubscribe = () => {
      listeners.delete(wrapped);
      cleanups.delete(wrapped);
      if (detachAbort) {
        detachAbort();
        detachAbort = undefined;
      }
    };

    let wrapped: (payload: P) => void = handler;
    if (options?.once) {
      wrapped = (payload) => {
        cleanup();
        handler(payload);
      };
    }
    listeners.add(wrapped);
    cleanups.set(wrapped, cleanup);

    const sig = options?.signal;
    if (sig) {
      const onAbort = () => cleanup();
      sig.addEventListener("abort", onAbort, { once: true });
      detachAbort = () => sig.removeEventListener("abort", onAbort);
    }

    return cleanup;
  }

  function emit(payload: P): void {
    if (listeners.size === 0) return;
    // Snapshot so a handler that unsubscribes (including the once-wrapper)
    // during dispatch does not perturb this pass.
    for (const fn of [...listeners]) fn(payload);
  }

  function clear(): void {
    // Run each cleanup so abort hooks are detached from caller AbortSignals
    // (SPR-R-01). Snapshot the values first because cleanup() mutates the map.
    for (const cleanup of [...cleanups.values()]) cleanup();
    // Each cleanup already removed its own entries; these clears make the
    // empty post-condition explicit. (A throwing cleanup would propagate and
    // skip them — listener callbacks and detach hooks are plain functions in
    // every documented path, so that trade-off is accepted over a try/finally.)
    listeners.clear();
    cleanups.clear();
  }

  return { on, emit, clear };
}
