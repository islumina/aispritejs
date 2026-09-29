# Changelog

All notable changes to aispritejs are summarized here.

## [0.6.0] - 2026-09-29

### Breaking

- `SpriteAnimator.update()` / `SpriteAnimator.reset()` (and the Pixi adapter's `update()` / `reset()`): a call made from inside an `onStateChange` / `onComplete` listener is now queued and runs after the current call finishes, including its `onEnd` auto-transition, instead of running inside the listener, because nested dispatch let the outer call's later listeners see a stale transition (run-to-completion, the ai*js rule for state-owning dispatchers); a `reset()` from `onComplete` therefore yields `onStateChange(onEndTarget, from)` then `onStateChange(initial, onEndTarget)`, ending in the initial state. Migration: listeners that inspected `activeState` (or `activeFrameKey` / `activeFrameIndex`) right after a nested `update()` / `reset()` must read it after the outer `update()` returns, code that counts `onStateChange` events around a `reset()` from `onComplete` must expect the extra `onEndTarget` pair, and errors thrown by a queued call must be caught around the outermost `update()` / `reset()`.
- `TransitionDef.priority`: a priority that is not an integer (`NaN`, `Infinity`, `1.5`, or a string such as `"1"`) now makes `createSpriteAnimator()` / `loadAtlas()` / `createPixiSpriteAnimator()` throw `InvalidGraphError` (`transition #<n> priority must be an integer, got <value>`), because such values made the candidate sort inconsistent and could flip which transition wins; the JSON Schema already required `integer`. Migration: use integer priorities (negative integers and `0` stay valid), for example convert JSON strings with `Number(p)` and round fractional values before building the graph.

### Changes

- Changed: size budgets in `scripts/check-size.mjs` (maintainer-approved for the 0.6.0 minor): `dist/pixi/index.js` 5,100 -> 5,200 B and `dist/atlas/index.js` 5,400 -> 5,500 B (`dist/index.js` stays at 4,400 B) for the run-to-completion mailbox, the identifier / priority / graph-shape / texture / control checks and the overflow guard, itemised in the script; after trimming duplicated gates, a dead guard and field, and comments kept in the bundle, the measured gzip closures are 4,358 -> 4,400, 5,042 -> 5,135 and 5,397 -> 5,486 B.
- Fixed: `emit()` re-checks listener membership on every call, so a `{ once }` listener can no longer fire twice when an earlier listener re-enters `update()`, and a listener removed mid-dispatch (by `dispose()` or an aborted `signal`) is no longer invoked.
- Fixed: `onComplete` gives each subscription its own identity instead of sharing a registry entry keyed by the raw handler, so subscribing the same handler twice no longer collides.
- Fixed: a throwing `onComplete`/`onStateChange` listener no longer wedges the state machine on its last frame — dispatch keeps calling the remaining listeners and `update()` still enters `onEnd`.
- Fixed: the Pixi adapter no longer writes to the sprite after `dispose()` is called from inside a listener mid-`update()`/`reset()`.
- Fixed: the Pixi adapter binds the initial frame correctly when its key is the empty string.
- Fixed: the Pixi adapter only stops a playable sprite's own playback after a bind succeeds, so a failed call has no side effect on the caller's sprite.
- Fixed: `createSpriteAnimator()` throws `InvalidGraphError` naming the field when `initial`, a state's `animation` / `onEnd`, a transition's `from` / `to`, or a condition's `input` / `op` is not a string (e.g. `transition #0 "from" must be a string, got object`); `Object.hasOwn` used to stringify a number or an array into a declared name, which could brick the animator or mis-evaluate conditions.
- Fixed: `createSpriteAnimator()` throws `InvalidGraphError` for a malformed graph shape (a non-object graph, `animations`, `inputs` or `states`, a non-array `transitions` or animation frame list, or a `null` input, state or condition entry) instead of a bare `TypeError`, or, for a string frame list, splitting it into one-character frame keys.
- Fixed: `update()` drops a step that would overflow the playback clock to `Infinity` (clamped to no progress, like an invalid `dt`), so a huge finite `dt` no longer freezes a looping clip on frame 0.
- Fixed: `createPixiSpriteAnimator()` treats an own `null` / `undefined` texture entry, or a nullish `textures` argument, as missing (`MissingTextureError`) instead of blanking the sprite or throwing a bare `TypeError`, and checks the graph's shape (`InvalidGraphError`) before scanning textures.
- Fixed: the Pixi adapter's `update()` / `reset()` sync the sprite even when a listener throws, so the sprite no longer stays on a frame the core has already left.
- Fixed: `parseAtlas()` / `loadAtlas()` run the embedded control block's structural checks on an explicit `control` as well (messages prefixed `control.`, e.g. `control.transitions[2].when[0] must be an object, got null`) and reject a non-string `control.initial` or a non-number `control.defaultFrameDuration`, all with `InvalidAtlasError`, instead of a bare `TypeError` from the compiler or a silently forwarded value.
- Fixed: `package.json` `exports` nests `types` under `import` and `require` (`require.types` points at the `.d.cts` files) for every code subpath, so `node16` / `nodenext` CommonJS consumers no longer hit TS1479; `verify-exports` walks nested conditions.
- Docs: the Pixi adapter's `textures` JSDoc and README Sharp Edges give the working workaround for a frame literally named `textures` (pass the `Spritesheet` or `{ textures: map }`); the old code comment's `spritesheet.textures` advice hit the same misdetection.
- Docs: STABILITY.md's Behavioral Contract states the run-to-completion clause, listener fan-out, the argument-validation boundary and the overflow clamp; `TransitionDef.priority`, `SpriteAnimator.update()` / `reset()` / `dispose()` and `InvalidGraphError` JSDoc match.

## [0.5.9] - 2026-06-29

- Fixed: a `reset()` / `dispose()` called from inside an `onComplete` handler is no longer clobbered by the state's `onEnd` auto-transition.
- Fixed: `clear()` fully clears its listener set even if an abort cleanup throws.
- Docs: schema hardening (non-empty `animations` + finite numeric maxima) is documented as shipped (was listed as backlog).

## [0.5.8] - 2026-06-14

- Changed: the graph compiler and JSON Schema now reject an empty `animations` map and enforce finite numeric maximums — frame/default duration `<= 86400000` ms (24 h) and state `speed` `<= 1000`.
- Documentation-only slimming pass across README, stability notes, review backlog, and LLM context.

## [0.5.7] - 2026-06-10

- Hardened graph compiler, atlas parser, Pixi adapter docs, and schema references.
- Clarified optional `pixi.js` peer behavior and parser/compiler error layering.
- Regenerated generated LLM context from canonical docs.

## Older releases

- `0.5.6` and `0.5.5` aligned package metadata and release hygiene with the ai*js family.
- `0.1.3` added the Pixi adapter, atlas parser, schema export, and examples.
- `0.1.2` and `0.1.1` hardened graph validation and documentation.
- `0.1.0` introduced `createSpriteAnimator`, input-driven transitions, listener APIs, errors, and deterministic update semantics.
