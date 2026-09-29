// aispritejs — a tiny single-payload typed signal. This is the package's OWN
// emitter; it deliberately does NOT import `aieventjs` or any sibling (P0
// zero-cross-package rule). Two instances back `onStateChange` and
// `onComplete`.

import type { ListenerOptions, Unsubscribe } from "./types.js";

/**
 * A typed fan-out of one payload `P`. `emit` is allocation-free in the common
 * case; it snapshots listeners only when there is at least one, so a handler
 * that unsubscribes (or a `once` handler) cannot corrupt the in-flight
 * iteration. A listener removed during a dispatch is skipped for the rest of it.
 * If listeners throw, the rest still run and the first error is rethrown.
 */
export interface Signal<P> {
  on(handler: (payload: P) => void, options?: ListenerOptions): Unsubscribe;
  emit(payload: P): void;
  /** Drop every listener (used by `dispose`). */
  clear(): void;
}

export function createSignal<P>(): Signal<P> {
  // Each listener maps to its cleanup function so clear() can detach abort
  // hooks as well as emptying the registry (fixes SPR-R-01).
  const listeners = new Map<(payload: P) => void, Unsubscribe>();

  function on(handler: (payload: P) => void, options?: ListenerOptions): Unsubscribe {
    const once = options?.once;
    const sig = options?.signal;
    // An already-aborted signal means the listener is dead on arrival.
    if (sig?.aborted) return () => {};

    let detachAbort: (() => void) | undefined;
    // One teardown shared by the unsubscribe return, the once-wrapper, and the
    // abort handler, so every path also detaches the abort listener — a `once`
    // handler that passed a `{ signal }` must not leave the abort listener
    // attached after it fires.
    const cleanup: Unsubscribe = () => {
      listeners.delete(wrapped);
      if (detachAbort) {
        detachAbort();
        detachAbort = undefined;
      }
    };

    // Always wrap, so every registration has its own identity in `listeners`
    // even when the same handler is subscribed more than once.
    const wrapped = (payload: P): void => {
      if (once) cleanup();
      handler(payload);
    };
    listeners.set(wrapped, cleanup);

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
    // during dispatch does not perturb this pass, but re-check membership so a
    // listener removed mid-dispatch (by a re-entrant emit that already fired a
    // once-wrapper, by dispose(), or by an aborted signal) is not called.
    // A throwing listener must not starve the rest: call every listener, then
    // rethrow the first error once the pass is complete.
    let failure: { error: unknown } | undefined;
    for (const fn of [...listeners.keys()]) {
      if (!listeners.has(fn)) continue;
      try {
        fn(payload);
      } catch (error) {
        failure ??= { error };
      }
    }
    if (failure) throw failure.error;
  }

  function clear(): void {
    // Run each cleanup so abort hooks are detached from caller AbortSignals
    // (SPR-R-01). Snapshot the values first because cleanup() mutates the map.
    // A throwing cleanup (e.g. a misbehaving AbortSignal.removeEventListener)
    // must not abort the iteration and must not prevent the map from being
    // fully emptied — mirror the aifsmjs dispose() try/catch + finally pattern.
    try {
      for (const cleanup of [...listeners.values()]) {
        try {
          cleanup();
        } catch {
          // Swallow per-cleanup errors; every registered cleanup must still run.
        }
      }
    } finally {
      // Guarantee an empty post-condition even if the loop itself somehow throws.
      listeners.clear();
    }
  }

  return { on, emit, clear };
}
