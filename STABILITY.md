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
- Graph validation is fail-fast; invalid graphs do not produce half-built animators.
- Trigger inputs are consumed when a transition uses them.
- `update(dt)` clamps invalid/non-positive elapsed time to no progress.
- `dispose()` is idempotent; post-dispose mutators throw.
- Pixi adapter owns sprite texture/anchor while bound and does not destroy the sprite on dispose.

## Caveats

- Atlas parser validates shape; compiler validates semantic graph correctness.
- All reachable frames need textures in the Pixi adapter.
- Schema hardening can improve editor feedback but does not replace runtime validation.
