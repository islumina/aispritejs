# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `PixiSpriteAnimator` now exposes `onComplete` / `onStateChange`, delegating directly to the core animator.

## [0.5.5] - 2026-06-08

### Changed

- Project home migrated to the [`islumina`](https://github.com/islumina) GitHub org; published from there via npm trusted publisher (OIDC + SLSA provenance). Version realigned from the `0.1.x` line to the shared ai\*js family version `0.5.5` — no API changes; the runtime is unchanged from `0.1.3`.

## [0.1.3] - 2026-06-05

### Added

- Docs: a "When you DON'T need aispritejs" threshold section and a complete, runnable 6-frame
  explosion (play-once FX) `/pixi` quickstart (`examples/02-explosion-pixi`); no source/API changes.

## [0.1.2] - 2026-06-05

### Changed

- JSON Schema: `animations` now requires at least one entry (`minProperties: 1`), matching `states`
  and the runtime (which already rejects an empty animations map via `InvalidGraphError`).

### Fixed

- Reject non-finite (`Infinity`/`NaN`) `speed`, `duration`, and `defaultFrameDuration` at compile
  time (`InvalidGraphError`); clamp non-finite `dt` to 0 in `update()` — previously these silently
  corrupted looping playback (frame stuck at 0 / `NaN` accumulation).

## [0.1.1] - 2026-06-03

First release published through the OIDC `publish.yml` pipeline (npm trusted
publisher), so the npm tarball carries **SLSA build provenance** — `0.1.0` was
published locally without it. No source/API changes.

### Changed

- Docs: corrected the **AI Generated** badge to the actual authoring model,
  `Claude Code Opus 4.8`, in `README.md` and `README_ZHTW.md` (matching the
  family's model-attribution convention).

## [0.1.0] - 2026-06-03

Initial release — the input-driven core plus the PixiJS v8 adapter, atlas
parser, and JSON Schema (roadmap modules 1–4).

### Added

- **`createSpriteAnimator(graph)`** — the public factory returning a
  `SpriteAnimator`. No exported class constructor (family convention: public
  API = `createX`). Implemented as closures, so methods never depend on `this`.
- **Inputs** — three kinds driving the visual state machine:
  - `Number` (continuous, e.g. `speed`) and `Boolean` (toggle, e.g.
    `isGrounded`), set via `setInput(name, value)`.
  - `Trigger` (one-shot, e.g. `jump`), fired via `fireTrigger(name)`; stays
    pending across frames until a transition consumes it.
  - O(1) lookup; unknown names throw `UnknownInputError`, kind mismatches throw
    `InputTypeError`, and `NaN` is rejected.
- **Transition graph** — `StateDef` (animation key + `loop` / `onEnd` / `speed`),
  `TransitionCondition` (`Equals` / `NotEquals` / `GreaterThan` / `LessThan` /
  `Trigger`), and `TransitionDef` with **Any-State** (`from: "*"`) and integer
  `priority`. Resolution is deterministic: highest priority then declared order,
  taking the first *effective* transition. A self-targeting transition is
  effective only if it consumes a Trigger (a Number/Boolean self-loop cannot
  restart the clip every frame).
- **`update(deltaMs)`** — advances the timer by `dt × speed` (negative `dt`
  clamps to `0`), evaluates transitions, computes the active frame from
  cumulative per-frame durations + loop, and fires `onComplete` once for a
  finished non-looping clip followed by any `onEnd` auto-transition. No
  per-frame allocation.
- **Outputs** — `activeState`, `activeFrameKey`, `activeFrameIndex` for renderer
  adapters.
- **Typed emitters** — `onStateChange((to, from) => …)` and
  `onComplete((state) => …)`, each returning an unsubscribe and accepting
  `{ signal, once }`. Own minimal implementation; **does not** import
  `aieventjs` or any sibling.
- **Lifecycle** — `reset()` returns to the initial state and restores input
  defaults without releasing buffers (fires `onStateChange` only if the state
  changed); `dispose()` is idempotent and makes subsequent mutators throw
  `SpriteAnimatorDisposedError`.
- **Fail-fast validation** — `createSpriteAnimator` validates every
  cross-reference the type system cannot (missing animation, unknown transition
  target, operator/kind compatibility, positive durations and speed, `onEnd`
  vs `loop`) and throws `InvalidGraphError`.
- **Atlas-shaped input** — the graph consumes PixiJS-v8-native `animations` /
  `frames` blocks (only frame keys + `duration` are read by the core),
  augmented with the `aispritejs` `inputs` / `states` / `transitions` block. A
  foreign event-driven `states` block is ignored.
- **Docs** — README (canonical) + `README_ZHTW.md`, `STABILITY.md`,
  `CONTRIBUTING.md`, `ROADMAP.md`, `llms.txt` / `llms-full.txt`, and a runnable
  Node example (`examples/01-platformer-inputs`).

### Added — `aispritejs/pixi` adapter

- **`createPixiSpriteAnimator(sprite, graph, textures, options?)`** on the
  `aispritejs/pixi` subpath — binds the renderer-agnostic core to a PixiJS v8
  `Sprite`. On each `update(dt)` it runs the core machine and, when the active
  frame changes, swaps the sprite's texture and applies that frame's atlas
  anchor (`texture.defaultAnchor`) — preserving non-centre / foot pivots
  (`{ applyAnchor: false }` opts out). Accepts a `Spritesheet` or a frame-key →
  `Texture` map.
- **`MissingTextureError`** — fail-fast at construction when a frame key the
  graph references has no texture (carries `.keys`).
- `pixi.js` declared as an **optional** `peerDependency`
  (`peerDependenciesMeta.optional`). The adapter imports it **type-only**, so
  the built subpath contains no runtime `pixi.js` require; the core never
  imports the adapter.
- Guard: if a *playing* `AnimatedSprite` is passed (it extends `Sprite`), its
  internal playback is stopped on bind so its ticker cannot fight the adapter's
  texture swaps. The adapter expects a plain `Sprite`.

### Added — `aispritejs/atlas` parser + JSON Schema

- **`parseAtlas(atlas, control?)`** and **`loadAtlas(atlas, control?)`** on the
  `aispritejs/atlas` subpath — turn a parsed PixiJS-v8 atlas into a
  `SpriteGraph` (or a ready `SpriteAnimator`). The atlas supplies the universal
  `animations` / `frames`; the input-driven control comes from the atlas itself
  (augmented shape) or from the `control` argument.
- **Ignores a foreign event-driven `states` block** — the FSM `{ initial,
  definitions }` shape emitted by other tools is detected and skipped; pass an
  `aispritejs` control block instead. Verified against the real family pipeline
  atlas (`test/fixtures/reimu-atlas.json`).
- **`InvalidAtlasError`** for structural problems (fail-fast); semantic problems
  surface as `InvalidGraphError` from the core.
- **JSON Schema** shipped at `schemas/aispritejs-graph.schema.json` (draft
  2020-12), exported as `aispritejs/schema`, describing the input-driven graph.
  The parser mirrors it in code, so there is no runtime schema-validator
  dependency.

### Guarantees (CI)

- Strict TypeScript (`strict` + `noUncheckedIndexedAccess` +
  `exactOptionalPropertyTypes`), no `any`.
- Dual ESM + CJS build via `tsup`; `sideEffects: false`; `.` + `/pixi` +
  `/atlas` + `/schema` subpath exports; per-subpath gzip budgets.
- **Zero runtime dependencies**; the root import graph contains no `pixi.js`,
  DOM, or canvas API.
- `prepublishOnly` gate: typecheck → lint → coverage → build → verify:exports →
  verify:llms → check:size. Coverage at 100 % statements / branches / functions
  / lines (above the family floor of 95 / 90 / 100 / 100). Core gzip ≈ 3.5 KB.
- OIDC + SLSA provenance publish on tag-push.

[Unreleased]: https://github.com/islumina/aispritejs/compare/v0.5.5...HEAD
[0.5.5]: https://github.com/islumina/aispritejs/releases/tag/v0.5.5
[0.1.3]: https://github.com/islumina/aispritejs/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/islumina/aispritejs/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/islumina/aispritejs/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/islumina/aispritejs/releases/tag/v0.1.0
