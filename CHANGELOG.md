# Changelog

All notable changes to aispritejs are summarized here.

## [Unreleased]

- Fixed: `emit()` re-checks listener membership on every call, so a `{ once }` listener can no longer fire twice when an earlier listener re-enters `update()`, and a listener removed mid-dispatch (by `dispose()` or an aborted `signal`) is no longer invoked.
- Fixed: `onComplete` gives each subscription its own identity instead of sharing a registry entry keyed by the raw handler, so subscribing the same handler twice no longer collides.
- Fixed: a throwing `onComplete`/`onStateChange` listener no longer wedges the state machine on its last frame — dispatch keeps calling the remaining listeners and `update()` still enters `onEnd`.
- Fixed: the Pixi adapter no longer writes to the sprite after `dispose()` is called from inside a listener mid-`update()`/`reset()`.
- Fixed: the Pixi adapter binds the initial frame correctly when its key is the empty string.
- Fixed: the Pixi adapter only stops a playable sprite's own playback after a bind succeeds, so a failed call has no side effect on the caller's sprite.

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
