#!/usr/bin/env node
// Verify gzip-compressed bundle size per ESM entry stays under budget.
//
// CHUNK-CLOSURE SEMANTICS (wave 2026-06-10): aispritejs builds with tsup
// `splitting: true` (cross-subpath class identity — see tsup.config.ts), so
// each entry file is a thin re-export shell that imports shared `chunk-*.js`
// files. Measuring only the entry (the vanilla family approach) is hollow —
// dist/index.js reports ~163 B while its true transitive closure carries the
// whole core. This script mirrors aiecsjs/scripts/check-size.mjs: BFS over
// relative imports from each entry, sum per-file gzip sizes over the
// reachable set, and budget that closure. Closure totals are comparable to
// the pre-split inlined bundle sizes, so the existing budget calibration
// keeps its meaning.
//
// ESM-ONLY SCOPE: only `dist/**/*.js` is measured; the `.cjs` twins share the
// same logic and would double-count the shared chunks.

import { gzipSync } from "node:zlib";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");

// Budgets are per-entry transitive-closure gzip size (bytes).
// wave 2026-06-10 actuals (closure semantics, leader-measured post-split):
//   index.js       4,175 B (+1 chunk)   pre-split single file was 3,994 B
//   pixi/index.js  4,852 B (+1 chunk)   pre-split 4,440 B
//   atlas/index.js 5,216 B (+1 chunk)   pre-split 4,813 B
// The wave's P1 fixes account for ~350 B of core growth (validation + emitter
// cleanup registry, unminified — gzip does the work, matching aifsmjs); the
// remaining ~180–400 B per entry is the per-file gzip overhead of splitting,
// accepted for cross-subpath class identity (consumers loading more than one
// subpath now share the chunk instead of downloading the core repeatedly).
//
// wave 0.5.9 actuals (2026-06-29): C7 onEnd guard + C8 clear() try/catch add
// ~40 B gzip to core (4,288 → 4,328 B) and pixi closure (4,966 → 5,005 B).
// Budgets raised +100 B each to absorb the intentional guard code.
//
// 0.6.0 (2026-09-29) — maintainer-approved raise for the 0.6.0 minor (family
// size-budget decision): index 4,400 → 4,700, pixi 5,100 → 5,400, atlas
// 5,400 → 5,700 B. Contracts that consumed bytes:
//   - run-to-completion FIFO mailbox for update()/reset() (core, all entries);
//   - InvalidGraphError for non-string identifiers (initial / animation /
//     onEnd / from / to / condition input+op), non-integer priority, and a
//     malformed graph shape (core, all entries);
//   - overflow guard: a step that would push `elapsed` to Infinity is dropped
//     (core, all entries);
//   - Pixi: nullish texture entries / map count as missing, the graph shape is
//     checked before the texture scan, sync() runs in `finally` (pixi);
//   - explicit `control` gets the embedded block's structural checks plus typed
//     initial / defaultFrameDuration (atlas).
// Trimmed first (about -420 B on the core closure): the dead onEnd guard
// clauses and CompiledState.animation field, the duplicated input-default and
// duration/speed gates, reset() now reusing enter(), resolve() returning the
// transition itself, and comments that esbuild kept inside object literals.
// Measured 0.5.9 → 0.6.0: index 4,358 → 4,400, pixi 5,042 → 5,135, atlas
// 5,397 → 5,486 B.
const budgets = {
  "index.js": 4_700,
  "pixi/index.js": 5_400,
  "atlas/index.js": 5_700,
};

// Relative-import regex matching both `from './foo'` and `import('./foo')`.
const IMPORT_RE = /(?:from|import)\s*['"](\.{1,2}\/[^'"]+)['"]/g;

function resolveChunkClosure(entryFile) {
  const visited = new Set();
  const queue = [entryFile];
  while (queue.length > 0) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    if (!existsSync(file)) continue;
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(IMPORT_RE)) {
      const rel = match[1];
      if (!rel) continue;
      const base = rel.split("?")[0].split("#")[0];
      const candidate = resolve(dirname(file), base);
      const resolved = existsSync(candidate)
        ? candidate
        : existsSync(`${candidate}.js`)
          ? `${candidate}.js`
          : null;
      if (resolved && resolved.startsWith(dist) && !visited.has(resolved)) {
        queue.push(resolved);
      }
    }
  }
  return visited;
}

const failures = [];
for (const [name, max] of Object.entries(budgets)) {
  const entryPath = resolve(dist, name);
  if (!existsSync(entryPath)) {
    failures.push(`${name}: missing (did you run pnpm build?)`);
    continue;
  }
  const reachable = resolveChunkClosure(entryPath);
  let totalGz = 0;
  for (const file of reachable) {
    if (!existsSync(file)) continue;
    totalGz += gzipSync(readFileSync(file)).length;
  }
  const pct = ((totalGz / max) * 100).toFixed(0);
  const tag = totalGz > max ? "FAIL" : "ok  ";
  const chunkCount = reachable.size - 1;
  console.log(
    `[${tag}] ${name.padEnd(16)} gz ${String(totalGz).padStart(6)} B / ${max} B (${pct}%)` +
      (chunkCount > 0 ? `  [+${chunkCount} chunk${chunkCount === 1 ? "" : "s"}]` : ""),
  );
  if (totalGz > max) failures.push(`${name}: ${totalGz} B > ${max} B budget`);
}

if (failures.length > 0) {
  console.error("\ncheck-size: bundle budget exceeded:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`\ncheck-size: all ${Object.keys(budgets).length} entries within budget.`);
