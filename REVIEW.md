# aispritejs Review

Current review state after the 2026-06-10 ai*js pass.

## Current Known Issues / Backlog

| Priority | Area | Status | Notes |
| --- | --- | --- | --- |
| P3 | Parser/compiler layering docs | Documented | Parser handles structural shape, compiler handles semantic graph correctness. Keep this distinction in errors/tests. |
| P3 | Optional Pixi peer clarity | Documented | `pixi.js` is optional and type-only for `/pixi`; root remains renderer-free. |

## Fixed Summary

- Prototype-chain key hardening uses own-property checks.
- Atlas `frames`, `states`, `inputs`, `transitions`, and `when` shapes are validated.
- Non-finite duration/speed/defaultFrameDuration are rejected; invalid `dt` is clamped to no progress.
- Pixi adapter rejects missing frame textures before binding.
- Schema hardening shipped (0.5.8): `minProperties: 1` on `animations`; finite numeric maximums for `duration`, `defaultFrameDuration`, and state `speed`.

## Verification Baseline

- `pnpm typecheck`
- `pnpm test`
- `pnpm verify:docs`
- `pnpm verify:exports`
- `pnpm verify:dist`
- `pnpm verify:llms`
- `pnpm check:size`
