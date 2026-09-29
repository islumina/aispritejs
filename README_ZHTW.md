# aispritejs

Input-driven、renderer-agnostic 的 2D sprite animation runtime。JSON graph 會把 Number/Boolean/Trigger inputs 對應到 visual states 與 frames；adapter 再把選到的 frame 綁到 renderer。

> **狀態：0.6.0 - 穩定 family-aligned API。** Core、PixiJS adapter、atlas parser、JSON Schema subpath 都已發布。

## 安裝

```bash
pnpm add aispritejs
pnpm add pixi.js # only when using aispritejs/pixi
```

```ts
import { createSpriteAnimator } from "aispritejs";
```

## 快速開始 - Core

```ts
const anim = createSpriteAnimator({
  inputs: {
    speed: { type: "number", default: 0 },
    jump: { type: "trigger" },
  },
  initial: "idle",
  states: {
    idle: { animation: "idle" },
    run: { animation: "run", speed: 1 },
    jump: { animation: "jump", loop: false, onEnd: "idle" },
  },
  transitions: [
    { from: "idle", to: "run", when: [{ input: "speed", op: "GreaterThan", value: 0 }] },
    { from: "*", to: "jump", when: [{ input: "jump", op: "Trigger" }] },
  ],
  animations: {
    idle: ["idle_0"],
    run: ["run_0", "run_1"],
    jump: ["jump_0", "jump_1"],
  },
});

anim.setInput("speed", 1);
anim.fireTrigger("jump");
anim.update(16.7);
console.log(anim.activeState, anim.activeFrameKey);
```

## PixiJS Adapter

```ts
import { createPixiSpriteAnimator } from "aispritejs/pixi";

const view = createPixiSpriteAnimator(sprite, graph, spritesheet);
view.update(deltaMs);
view.dispose(); // dispose core animator；不 destroy Pixi sprite
```

`pixi.js` 是 optional peer dependency，adapter 只用 type-only import。root package 不 import Pixi、DOM 或 canvas API。

## Atlas and Schema

- `parseAtlas(atlas, control?)` 將 PixiJS-v8 atlas 加 control block 轉成 `SpriteGraph`。
- `loadAtlas(atlas, control?)` parse 後直接建立 `SpriteAnimator`。
- `aispritejs/schema` 匯出 `schemas/aispritejs-graph.schema.json`，可用於 editor/CI validation。
- Parser 做 structural validation（`InvalidAtlasError`）；compiler 做 semantic validation（`InvalidGraphError`）。
- 明確傳入的 `control` 會套用與 atlas 內嵌 control block 相同的 structural 檢查，且 `initial` / `defaultFrameDuration` 必須分別是 string / number（atlas 自己的 block 則會略過型別錯誤的欄位）。

## 核心 API

- `createSpriteAnimator(graph)` 回傳 `SpriteAnimator`；graph 結構錯誤或無效時丟出 `InvalidGraphError`，不會建立任何 animator。
- `setInput(name, value)` 接受 Number/Boolean inputs。
- `fireTrigger(name)` 觸發 Trigger input，transition 後會消耗。
- `update(deltaMs)` 推進時間、transition、frame index 與 `onEnd`。負數、非 finite 或會溢位的 step 一律視為不前進。
- `reset()` 回到 initial state。
- `dispose()` 可重複呼叫；dispose 後 mutators 會丟 `SpriteAnimatorDisposedError`。
- `onStateChange(handler, options?)` 與 `onComplete(handler, options?)` 支援 `once` 與 `signal`。

## 注意事項

- 非 loop state 若有 `onEnd`，會在 clip 完成的同一個 `update()` tick 轉場。
- 在 `onStateChange`/`onComplete` 內呼叫的 `reset()`/`update()` 會排入佇列，等目前這次 update（包含其 `onEnd` 自動轉場）結束後才執行；因此在 `onComplete` 呼叫 `reset()` 會先觸發 `onStateChange(onEndTarget, from)`，再觸發 `onStateChange(initial, onEndTarget)`，最後停在 initial state；在 listener 內呼叫 `dispose()` 則會立刻停止這次 update。
- Pixi adapter 接受 `AnimatedSprite`，因為它 extends `Sprite`；bind 時會 stop playback，避免跟 adapter 搶 texture。
- 每個 animation（即使沒有任何 state 參照到它）裡的每個 frame key 都必須存在於 texture map/spritesheet，否則 adapter 會在 construction 時丟 `MissingTextureError`。值為 `null` / `undefined` 的 entry 也視為缺少。
- texture map 若在 `textures` key 下放了物件，會被當成 `Spritesheet` 讀取；若真的有 frame 叫 `textures`，請傳入 `Spritesheet`（或 `{ textures: map }`），不要直接傳 map。
- `duration`、`defaultFrameDuration`、state `speed` 都必須是 finite 且大於 0。
- `initial`、state 的 `animation` / `onEnd`、transition 的 `from` / `to`、condition 的 `input` / `op` 都必須是 string，transition `priority` 必須是整數。
- `animations` 不可為空物件（`minProperties: 1`）；`duration`、`defaultFrameDuration` 上限為 86,400,000 ms（24 小時），state `speed` 上限為 1000——schema 與 runtime 已一致。

## AI Context

- 短索引：[`llms.txt`](llms.txt)
- 完整生成內容：[`llms-full.txt`](llms-full.txt)
- 穩定度契約：[`STABILITY.md`](STABILITY.md)
- 目前 review backlog：[`REVIEW.md`](REVIEW.md)
- 範例索引：[`examples/README.md`](examples/README.md)
- 版本紀錄：[`CHANGELOG.md`](CHANGELOG.md)

## License

MIT
