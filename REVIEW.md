# aispritejs Review

Current review state after the 2026-09-28 ai*js pass.

## Current Known Issues / Backlog

| Priority | Area | Status | Notes |
| --- | --- | --- | --- |
| P3 | Parser/compiler layering docs | Documented | Parser handles structural shape, compiler handles semantic graph correctness. Keep this distinction in errors/tests. |
| P3 | Optional Pixi peer clarity | Documented | `pixi.js` is optional and type-only for `/pixi`; root remains renderer-free. |
| P1 | Non-string graph identifiers (`src/sprite/compile.ts`) | Open | `compileGraph` checks `initial`/`animation`/`onEnd`/`from`/`to`/condition `input` only via `Object.hasOwn`, which stringifies numbers and arrays; a non-string identifier can permanently brick the animator or silently mis-evaluate conditions. Fix: require `typeof x === "string"` before each check and throw `InvalidGraphError` naming the field. |
| P3 | Own-but-nullish texture entries (`src/pixi/animator.ts`) | Open | The texture-map check only tests `Object.hasOwn`, so an own `undefined`/`null` value passes as present and later blanks the sprite or throws mid-`update()`. Fix: also treat a nullish map value as missing. |
| P3 | Non-numeric transition priority (`src/sprite/compile.ts`) | Open | `priority` is never checked to be a finite number; a `NaN` or string priority makes the sort comparator inconsistent and can flip which well-formed transition wins. Fix: reject a non-finite/non-integer `priority` in `compileGraph`. |
| P3 | Re-entrant listener dispatch (`src/sprite/emitter.ts`) | Open | `emit()` delivers a nested transition (from a listener calling `update()`/`reset()` re-entrantly) before the outer dispatch finishes, so later listeners can see a stale `to`. Fix: queue emissions during dispatch and flush in order, or detect and reject re-entrancy — needs a documented semantics decision. |
| P3 | Unchecked `control` block (`src/atlas/parse.ts`) | Open | `parseAtlas` adopts an explicit `control` argument without any structural checks, so a malformed control block surfaces as a bare `TypeError` instead of `InvalidAtlasError`, unlike the same block embedded in the atlas. Fix: run the existing inputs/states/transitions/`when` shape checks on `control` too. |
| P3 | Huge finite `dt` overflow (`src/sprite/machine.ts`) | Open | A finite but very large `dt` can still overflow `elapsed` to `Infinity` (distinct from the intentional gradual accumulation), so `elapsed % total` becomes `NaN` and a looping clip freezes on frame 0. Fix: commit `elapsed + step` only when it stays finite. Deferred: any of the candidate one-line fixes pushes the `atlas` entry's gzip closure over its budget (already at 100%); needs an offsetting size refactor first. |

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

## Verification Baseline

- `pnpm typecheck`
- `pnpm test`
- `pnpm verify:docs`
- `pnpm verify:exports`
- `pnpm verify:dist`
- `pnpm verify:llms`
- `pnpm check:size`
