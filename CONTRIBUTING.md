# Contributing to aispritejs

Keep the core renderer-free and keep adapters thin.

## Local workflow

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm verify:docs
pnpm build:llms
pnpm verify:llms
pnpm verify:exports
pnpm verify:dist
pnpm check:size
```

Run `pnpm lint` before PRs. If docs change, regenerate `llms-full.txt`.

## Rules

- Root imports must not pull Pixi, DOM, canvas, or renderer code.
- Keep parser structural errors and compiler semantic errors distinct.
- Add tests for graph validation, trigger consumption, frame timing, `onEnd`, listeners, dispose, and Pixi missing-texture paths.
- Keep examples short and point to runnable files under `examples/`.

## License

MIT
