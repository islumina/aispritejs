# Stability

## Stable Surface

| Surface | Status | Notes |
| --- | --- | --- |
| `aispritejs` | Stable | Core graph types, errors, and `createSpriteAnimator`. |
| `aispritejs/pixi` | Stable | PixiJS v8 adapter; `pixi.js` optional peer. |
| `aispritejs/atlas` | Stable | `parseAtlas`, `loadAtlas`, `InvalidAtlasError`. |
| `aispritejs/schema` | Stable artifact | JSON Schema file export. |

## Behavioral Contract

- Core is renderer-agnostic and has zero runtime dependencies.
- Graph validation is fail-fast; invalid graphs do not produce half-built animators. A malformed graph shape (a non-object graph, `animations`, `inputs` or `states`, a non-array `transitions` or frame list, a `null` entry), a non-string identifier (`initial`, state `animation` / `onEnd`, transition `from` / `to`, condition `input` / `op`), or a non-integer `priority` throws `InvalidGraphError` naming the field, never a bare `TypeError`.
- Trigger inputs are consumed when a transition uses them.
- `update(dt)` clamps invalid/non-positive elapsed time to no progress, and drops a step that would overflow the playback clock to `Infinity` (also no progress).
- `update()` / `reset()` are run-to-completion. A call made while the same animator is already dispatching (from an `onStateChange` / `onComplete` listener, or any callback the dispatch invokes) is appended to a FIFO mailbox and returns at once; after the outer call's last notification (and its `onEnd` auto-transition) the mailbox drains in order, each entry running the full update or reset before the next. `setInput()` / `fireTrigger()` only write the input store and are never queued. `dispose()` is never queued: it runs at once, clears the mailbox, and the drain stops. If a listener or a queued entry throws, the mailbox is cleared, the dispatching flag is reset, and the error propagates from the outermost call; the state stays at the last committed transition. Two animators have independent mailboxes. A listener that queues a call on every notification of a graph that always transitions keeps the drain running.
- Listener fan-out is synchronous over a snapshot of the listeners taken when the notification starts: a listener added meanwhile first fires on the next notification, one removed meanwhile (its unsubscribe, `once`, its `signal`, or `dispose()`) is skipped for the rest of that round, a `once` listener is removed before it is called, and a throwing listener does not stop the others (the first error is rethrown once all have run).
- `dispose()` is idempotent; post-dispose mutators throw (also from a listener).
- Pixi adapter owns sprite texture/anchor while bound and does not destroy the sprite on dispose. It syncs the sprite after every `update()` / `reset()`, also when a listener throws, and treats a `null` / `undefined` texture entry (or a nullish texture map) as missing.
- Argument misuse: `createSpriteAnimator` and `createPixiSpriteAnimator` report a malformed graph with `InvalidGraphError`; `parseAtlas` / `loadAtlas` report a malformed atlas or explicit `control` with `InvalidAtlasError`. Listener handlers, `ListenerOptions.signal`, and the Pixi `sprite` are trusted typed arguments; misuse there can still surface as a bare `TypeError` (REVIEW.md backlog).

## Caveats

- Atlas parser validates shape (for the atlas's own control block and an explicit `control` alike); compiler validates semantic graph correctness.
- Every frame key in every declared animation needs a texture in the Pixi adapter, not just frames reachable from the graph's states.
- Schema hardening can improve editor feedback but does not replace runtime validation.
