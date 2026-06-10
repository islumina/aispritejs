#!/usr/bin/env node
// Verify gzip-compressed bundle size per subpath stays under budget.
// Run after `pnpm build`; fails the publish if any entry exceeds.

import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const budgets = {
  // wave 2026-06-10 P1 fixes grew the core +348 B gzip (3,646 → 3,994 B,
  // leader-measured on main vs fix branch builds): SPR-S-03 input-default
  // typeof validation + SPR-R-01 cleanups registry in the emitter, unminified
  // with descriptive error messages. Budget raised to 4,100 B (~100 B margin).
  // (Prior: 3,800 B, measured ~3,481 B in v0.1.0.)
  "dist/index.js": 4_100,
  // wave 2026-06-10: +346 B gzip (4,094 → 4,440 B) — the core delta carried
  // into this bundle (splitting:false) plus SPR-S-01 Object.hasOwn in the
  // missing-texture scan. Budget 4,600 B (~160 B margin).
  // (Prior: 4,200 B, measured ~3,881 B in v0.2.0.)
  "dist/pixi/index.js": 4_600,
  // wave 2026-06-10: +435 B gzip (4,378 → 4,813 B) — the core delta plus
  // SPR-S-02 per-item `when` validation in parseAtlas. Budget 5,000 B
  // (~185 B margin). (Prior: 4,400 B, measured ~4,076 B in v0.3.0.)
  "dist/atlas/index.js": 5_000,
};

const failures = [];
for (const [rel, max] of Object.entries(budgets)) {
  const abs = resolve(root, rel);
  let buf;
  try {
    buf = await readFile(abs);
  } catch {
    failures.push(`${rel}: missing (did you run pnpm build?)`);
    continue;
  }
  const gz = gzipSync(buf).length;
  const pct = ((gz / max) * 100).toFixed(0);
  const tag = gz > max ? "FAIL" : "ok  ";
  console.log(`[${tag}] ${rel.padEnd(28)} gz ${String(gz).padStart(5)} B / ${max} B (${pct}%)`);
  if (gz > max) failures.push(`${rel}: ${gz} B > ${max} B budget`);
}

if (failures.length > 0) {
  console.error("\ncheck-size: bundle budget exceeded:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`\ncheck-size: all ${Object.keys(budgets).length} entries within budget.`);
