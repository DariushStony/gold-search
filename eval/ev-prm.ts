// EV-PRM: implied ojrat (BR-43) against Digikala's declared ojrat, on products
// without non-gold parts (BR-2A, D-19). Run: node eval/ev-prm.ts [--split=test --release]
import { extract } from "../src/core/extract.ts";
import { impliedOjratPct } from "../src/core/price.ts";
import { config } from "../src/core/config.ts";
import { ROOT, readCsv, splitFromArgs } from "./lib.ts";

// Eval plan §2: 70/30 by product id, seed 42 (same generator as the EV-MAT sampler).
function testIds(ids: string[]): Set<string> {
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const a = [...ids].sort();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return new Set(a.slice(0, Math.round(a.length * 0.3)));
}

function bootstrapMae(errors: number[], resamples = 2000): [number, number] {
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const means: number[] = [];
  for (let r = 0; r < resamples; r++) {
    let s = 0;
    for (let i = 0; i < errors.length; i++) s += errors[Math.floor(rand() * errors.length)]!;
    means.push(s / errors.length);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(resamples * 0.025)]!, means[Math.floor(resamples * 0.975)]!];
}

const split = splitFromArgs();
const all = readCsv(`${ROOT}docs/evidence/ev-prm-digikala-2026-10-22.csv`);
const test = testIds(all.map((r) => r.id!));
const rows = all.filter((r) => (split === "test") === test.has(r.id!));

const clean: number[] = [], partial: number[] = [];
for (const r of rows) {
  const attrs = extract({ title: r.title!, specs: {}, shop: null });
  const declaredParts = Number(r.non_gold_cost_rial) > 0 || Number(r.non_gold_wage_rial) > 0;
  const karat = Number(r.carat!.replace("carat_", "")) || 18;
  const gold = Number(r.weight_g) * (Number(r.gold_price_rial) / 10) * (karat / 18);
  const ratio = Number(r.rrp_rial) / 10 / gold;
  const err = Math.abs(impliedOjratPct(ratio, config.price.vatByJalaliYear[1405]!, config.price.profit) - Number(r.ojrat_declared_pct));
  (attrs.non_gold || declaredParts ? partial : clean).push(err);
}

const mae = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const [lo, hi] = bootstrapMae(clean);
console.log(JSON.stringify({
  split, n_rows: rows.length, n_clean: clean.length, mae_clean_pp: +mae(clean).toFixed(2), ci95: [+lo.toFixed(2), +hi.toFixed(2)],
  n_non_gold_parts: partial.length, mae_non_gold_parts_pp: partial.length ? +mae(partial).toFixed(1) : null, target_pp: 3,
}, null, 1));
