# aispritejs Review

Current review state after the 2026-09-29 ai*js 0.6.0 pass.

## Current Known Issues / Backlog

| Priority | Area | Status | Notes |
| --- | --- | --- | --- |
| P3 | Parser/compiler layering docs | Documented | Parser handles structural shape, compiler handles semantic graph correctness. Keep this distinction in errors/tests. |
| P3 | Optional Pixi peer clarity | Documented | `pixi.js` is optional and type-only for `/pixi`; root remains renderer-free. |
| P3 | Argument validation outside the graph/atlas (`src/sprite/emitter.ts`, `src/pixi/animator.ts`) | Deferred | `onStateChange`/`onComplete` accept a non-function handler (it throws a bare `TypeError` at the next notification, rethrown from `update()`), a `signal` that is not an `AbortSignal` throws a bare `TypeError` at subscribe, and `createPixiSpriteAnimator` with a missing `sprite` throws a bare `TypeError` after the texture check. Deferred: no existing error class fits (`InvalidGraphError` describes the graph, `MissingTextureError` the textures), and adding an argument error class is a 1.0 API-surface decision for the maintainer; STABILITY.md documents the boundary. |
| — | Frame key named `textures` | Documented | Spritesheet detection is structural (`pixi.js` is type-only), so a plain texture map with an object under `textures` is read as a Spritesheet. Workaround in README Sharp Edges and the `textures` JSDoc: pass the Spritesheet or `{ textures: map }`. |
| — | Size headroom | Note | 4,400 / 4,400 B (`index`), 5,135 / 5,200 B (`pixi`), 5,486 / 5,500 B (`atlas`) after this pass; the pixi and atlas budgets were raised for 0.6.0 with an itemised comment in `scripts/check-size.mjs`. |

## Fixed Summary

- Prototype-chain key hardening uses own-property checks.
- Atlas `frames`, `states`, `inputs`, `transitions`, and `when` shapes are validated.
- Non-finite duration/speed/defaultFrameDuration are rejected; invalid `dt` is clamped to no progress.
- Pixi adapter rejects missing frame textures before binding.
- Schema hardening shipped (0.5.8): `minProperties: 1` on `animations`; finite numeric maximums for `duration`, `defaultFrameDuration`, and state `speed`.
- `emit()` re-checks listener membership per call, so a `{ once }` listener can no longer double-fire and a listener removed mid-dispatch (by `dispose()` or an aborted signal) is no longer invoked.
- `onComplete` wraps every subscription with its own identity, so subscribing the same handler twice no longer shares one cleanup entry.
- A throwing `onComplete`/`onStateChange` listener no longer wedges the state machine: `emit()` calls every listener and rethrows the first error, and `update()` still enters `onEnd` in a `finally`.
- The Pixi adapter's `sync()` returns early once the core is disposed, so a listener that calls `dispose()` (and destroys the sprite) mid-update no longer crashes or has its texture overwritten.
- The Pixi adapter binds the initial frame correctly even when the first frame key is the empty string (`boundKey` now starts `undefined`, not `""`).
- The Pixi adapter only stops a playable sprite's own playback after a bind succeeds, so a failed `createPixiSpriteAnimator` call has no side effect on the caller's sprite.
- Documented that a satisfied Number/Boolean self-transition without a trigger is skipped by `resolve()` regardless of priority, so it cannot outrank a lower-priority exit.
- Corrected the "reachable frame keys" claim in README/README_ZHTW/STABILITY: the Pixi adapter requires a texture for every frame of every declared animation, not just frames a state references.
- Replaced the stale README_ZHTW schema backlog line (`minProperties` / finite maxima) with the shipped constraints.
- Corrected the example 02 comment claiming the Pixi adapter hides `onComplete`/`onStateChange`; it delegates both.
- 0.6.0: `update()`/`reset()` are run-to-completion with a FIFO mailbox; a call from a listener runs after the current call (including its `onEnd`), `dispose()` clears the queue, and a throw drops it (re-entrant listener dispatch).
- 0.6.0: `compileGraph` rejects a non-string `initial`, state `animation`/`onEnd`, transition `from`/`to`, or condition `input`/`op` with `InvalidGraphError` naming the field, before any `Object.hasOwn` lookup; validation tests pin each field against the schema's string type (P1 non-string identifiers).
- 0.6.0: `compileGraph` rejects a non-integer transition `priority` (non-numeric priority).
- 0.6.0: the Pixi adapter treats an own `null`/`undefined` texture entry, and a nullish texture map, as missing (nullish texture entries).
- 0.6.0: `parseAtlas` runs the embedded block's structural checks on an explicit `control` and rejects a wrong-typed `control.initial`/`control.defaultFrameDuration` (unchecked control block).
- 0.6.0: `update()` drops a step that would overflow `elapsed` to `Infinity` (huge finite `dt` overflow); the atlas budget blocker was cleared by trimming plus the 0.6.0 budget raise.
- 0.6.0: the Pixi adapter syncs the sprite in `finally`, so a throwing listener no longer leaves it on a frame the core has left.
- 0.6.0 family rules: `createSpriteAnimator`/`createPixiSpriteAnimator` report a malformed graph shape with `InvalidGraphError` instead of a bare `TypeError`; `package.json` `exports` nest `types` under `import`/`require` with `.d.cts` types, checked by the recursive `verify-exports` and `test/exports.test.ts`.
- 0.6.0 docs: corrected the Spritesheet-detection workaround for a frame named `textures` (the old `spritesheet.textures` advice hit the same misdetection).
- 0.6.0 size: the dead onEnd guard clauses and `CompiledState.animation` field, the duplicated input-default and duration/speed gates, and comments esbuild kept inside object literals were removed; `reset()` reuses `enter()`.

## Verification Baseline

- `pnpm typecheck`
- `pnpm test`
- `pnpm verify:docs`
- `pnpm verify:exports`
- `pnpm verify:dist`
- `pnpm verify:llms`
- `pnpm check:size`
