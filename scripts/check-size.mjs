#!/usr/bin/env node
// Verify gzip-compressed bundle size per subpath stays under budget.
// Run after `pnpm build`; fails the publish if any entry exceeds.

import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const budgets = {
  // wave 2026-06-10 P1 fixes added ~190 B net to the core (SPR-S-03 input
  // default typeof check + SPR-R-01 cleanups Map in emitter). Measured at
  // 3,994 B post-fix; budget raised to 4,100 B for a ~100 B safety margin.
  // (Prior: 3,800 B measured at ~3,481 B in v0.1.0.)
  "dist/index.js": 4_100,
  // wave 2026-06-10: SPR-S-01 Object.hasOwn in missing-texture scan adds ~30 B
  // on top of the core delta. Measured at 4,440 B post-fix; budget 4,600 B.
  // (Prior: 4,200 B measured at ~3,881 B in v0.2.0.)
  "dist/pixi/index.js": 4_600,
  // wave 2026-06-10: SPR-S-02 when-item validation loop adds ~220 B on top of
  // the core delta. Measured at 4,813 B post-fix; budget 5,000 B.
  // (Prior: 4,400 B measured at ~4,076 B in v0.3.0.)
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
